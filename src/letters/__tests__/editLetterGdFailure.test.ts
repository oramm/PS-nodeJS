import { OAuth2Client } from 'google-auth-library';

/**
 * Błąd kroku Dysku nie może zostawić bazy i Dysku w rozjeździe.
 *
 * Powiązania ze sprawami są zapisane i zacommitowane, ZANIM `editLetterPrivate`
 * dotknie Dysku. Jeśli `editLetterGdElements` rzuci, a uzgadnianie skrótów stoi
 * za nim bez osłony, wiersze `Letters_Cases` wskazują nową sprawę, a skrót
 * został w starej — i żadna kolejna edycja tego nie naprawi, bo uzgadnianie
 * pracuje na RÓŻNICY zestawów spraw, której już nie widać.
 */

const reconcileCaseShortcuts = jest.fn();
const findCasesByLetterId = jest.fn();
const findEditContextById = jest.fn();
const editInDb = jest.fn();

jest.mock('../resolveShortcutParentId', () => ({
    createCaseShortcuts: jest.fn(),
    syncCaseShortcutNames: jest.fn(),
    reconcileCaseShortcuts: (...args: unknown[]) =>
        reconcileCaseShortcuts(...args),
    resolveShortcutParentId: jest.fn(),
}));

jest.mock('../../tools/ToolsDb', () => ({
    __esModule: true,
    default: {
        transaction: async (callback: (conn: unknown) => Promise<unknown>) =>
            callback({}),
        executePreparedStmt: jest.fn(),
        sqlToString: (value: unknown) => value,
    },
}));

jest.mock('../LetterRepository', () => ({
    __esModule: true,
    default: class {
        editInDb = editInDb;
        findEditContextById = findEditContextById;
    },
}));

jest.mock('../associations/LetterCaseAssociationsController', () => ({
    __esModule: true,
    default: {
        add: jest.fn(),
        findCasesByLetterId: (...args: unknown[]) =>
            findCasesByLetterId(...args),
    },
}));

jest.mock('../associations/LetterEntityAssociationsController', () => ({
    __esModule: true,
    default: { add: jest.fn() },
}));

jest.mock('../../tools/ToolsMail', () => ({
    __esModule: true,
    default: { sendServerErrorReport: jest.fn() },
}));

import LettersController from '../LettersController';

const auth = {} as OAuth2Client;
const userData = { enviId: 613 } as any;

const BLAD_DYSKU = new Error('Google Drive: 429 Too Many Requests');

const makeLetter = (editLetterGdElements: jest.Mock) =>
    ({
        id: 6163,
        number: 6163,
        // opis inny niż w bazie => edycja NIE jest „tylko sprawy",
        // więc krok Dysku się wykonuje (i tu: pada)
        description: 'Opis po zmianie',
        creationDate: '2026-07-30',
        registrationDate: '2026-07-30',
        status: 'CREATED',
        gdDocumentId: 'doc-1',
        gdFolderId: 'letter-folder-1',
        _cases: [{ id: 20, gdFolderId: 'case-folder-20' }],
        _entitiesMain: [{ id: 659 }],
        _entitiesCc: [],
        editLetterGdElements,
    } as any);

const dbContext = {
    id: 6163,
    number: '6163',
    description: 'Opis przed zmianą',
    creationDate: '2026-07-30',
    registrationDate: '2026-07-30',
    gdDocumentId: 'doc-1',
    gdFolderId: 'letter-folder-1',
    entityKeys: ['MAIN:659'],
};

beforeEach(() => {
    jest.clearAllMocks();
    findEditContextById.mockResolvedValue(dbContext);
    findCasesByLetterId
        .mockResolvedValueOnce([{ id: 10, gdFolderId: 'case-folder-10' }])
        .mockResolvedValue([{ id: 20, gdFolderId: 'case-folder-20' }]);
    editInDb.mockResolvedValue({});
});

describe('editLetter — błąd kroku Dysku', () => {
    it('uzgadnia skróty MIMO błędu editLetterGdElements, żeby baza i Dysk się nie rozjechały', async () => {
        const gdElements = jest.fn().mockRejectedValue(BLAD_DYSKU);

        await expect(
            LettersController.editLetter(
                makeLetter(gdElements),
                [],
                userData,
                undefined,
                auth
            )
        ).rejects.toThrow('Google Drive: 429 Too Many Requests');

        expect(gdElements).toHaveBeenCalled();
        expect(reconcileCaseShortcuts).toHaveBeenCalledTimes(1);

        const [, identity, previousCases, currentCases] =
            reconcileCaseShortcuts.mock.calls[0];
        expect(identity).toEqual(
            expect.objectContaining({ id: 6163, gdDocumentId: 'doc-1' })
        );
        expect(previousCases).toEqual([
            { id: 10, gdFolderId: 'case-folder-10' },
        ]);
        expect(currentCases).toEqual([
            { id: 20, gdFolderId: 'case-folder-20' },
        ]);
    });

    it('oddaje błąd Dysku dalej, więc użytkownik nie dostaje fałszywego sukcesu', async () => {
        const gdElements = jest.fn().mockRejectedValue(BLAD_DYSKU);

        await expect(
            LettersController.editLetter(
                makeLetter(gdElements),
                [],
                userData,
                undefined,
                auth
            )
        ).rejects.toBe(BLAD_DYSKU);
    });

    it('przy udanym kroku Dysku uzgadnia skróty i nie rzuca', async () => {
        const gdElements = jest.fn().mockResolvedValue(undefined);

        await expect(
            LettersController.editLetter(
                makeLetter(gdElements),
                [],
                userData,
                undefined,
                auth
            )
        ).resolves.toBeUndefined();

        expect(reconcileCaseShortcuts).toHaveBeenCalledTimes(1);
    });
});
