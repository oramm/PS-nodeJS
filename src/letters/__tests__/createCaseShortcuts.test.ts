import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../../tools/ToolsGd';
import { LetterData } from '../../types/types';
import {
    createCaseShortcuts,
    syncCaseShortcutNames,
} from '../resolveShortcutParentId';

jest.mock('../../tools/ToolsGd');

const auth = {} as OAuth2Client;

const makeLetter = (extra: Record<string, unknown>): LetterData =>
    ({
        number: 123,
        description: 'Opis pisma',
        gdDocumentId: 'doc-1',
        _cases: [{ gdFolderId: 'case-folder-1' }, { gdFolderId: 'case-folder-2' }],
        ...extra,
    } as unknown as LetterData);

describe('createCaseShortcuts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('tworzy skrót w folderze każdej sprawy pisma kontraktowego', async () => {
        await createCaseShortcuts(auth, makeLetter({ _project: { id: 1 } }));

        expect(ToolsGd.createShortcut).toHaveBeenCalledTimes(2);
        expect(ToolsGd.createShortcut).toHaveBeenCalledWith(auth, {
            targetId: 'doc-1',
            parentId: 'case-folder-1',
            name: '123 Opis pisma',
        });
    });

    it('nie tworzy skrótów dla pisma do oferty — oryginał leży już w folderze sprawy', async () => {
        await createCaseShortcuts(auth, makeLetter({ _offer: { id: 7 } }));

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
    });

    it('pomija pismo bez pliku i folderu na Google Drive', async () => {
        await createCaseShortcuts(
            auth,
            makeLetter({ _project: { id: 1 }, gdDocumentId: null, gdFolderId: null })
        );

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
    });
});

describe('syncCaseShortcutNames', () => {
    beforeEach(() => jest.clearAllMocks());

    it('zmienia nazwę tylko tym skrótom, które się rozjechały', async () => {
        (ToolsGd.findShortcutsByTarget as jest.Mock).mockResolvedValue([
            {
                id: 'shortcut-stary',
                name: '123 Poprzedni opis',
                parents: ['case-folder-1'],
            },
            {
                id: 'shortcut-aktualny',
                name: '123 Opis pisma',
                parents: ['case-folder-2'],
            },
        ]);

        await syncCaseShortcutNames(auth, makeLetter({ _project: { id: 1 } }));

        expect(ToolsGd.updateFile).toHaveBeenCalledTimes(1);
        expect(ToolsGd.updateFile).toHaveBeenCalledWith(auth, {
            id: 'shortcut-stary',
            name: '123 Opis pisma',
        });
    });

    it('nie rusza skrótów spoza folderów spraw pisma', async () => {
        (ToolsGd.findShortcutsByTarget as jest.Mock).mockResolvedValue([
            {
                id: 'skrot-prywatny',
                name: 'Moja kopia',
                parents: ['folder-roboczy-uzytkownika'],
            },
        ]);

        await syncCaseShortcutNames(auth, makeLetter({ _project: { id: 1 } }));

        expect(ToolsGd.updateFile).not.toHaveBeenCalled();
    });

    it('porządkuje też skróty pism do ofert utworzone przed wyłączeniem skrótów', async () => {
        (ToolsGd.findShortcutsByTarget as jest.Mock).mockResolvedValue([
            {
                id: 'skrot-historyczny',
                name: '123 Stary opis',
                parents: ['case-folder-2'],
            },
        ]);

        await syncCaseShortcutNames(auth, makeLetter({ _offer: { id: 7 } }));

        expect(ToolsGd.updateFile).toHaveBeenCalledWith(auth, {
            id: 'skrot-historyczny',
            name: '123 Opis pisma',
        });
    });

    it('szuka skrótów w podfolderze „Pisma", nie zakładając go, gdy nie istnieje', async () => {
        const caseInSubfolderContract = {
            gdFolderId: 'case-folder-1',
            _parent: { _contract: { lettersShortcutsInSubfolder: true } },
        };
        (ToolsGd.getFileMetaDataByName as jest.Mock).mockResolvedValue({
            id: 'pisma-subfolder',
        });
        (ToolsGd.findShortcutsByTarget as jest.Mock).mockResolvedValue([
            {
                id: 'skrot-w-podfolderze',
                name: '123 Stary opis',
                parents: ['pisma-subfolder'],
            },
        ]);

        await syncCaseShortcutNames(
            auth,
            makeLetter({ _project: { id: 1 }, _cases: [caseInSubfolderContract] })
        );

        expect(ToolsGd.setFolder).not.toHaveBeenCalled();
        expect(ToolsGd.updateFile).toHaveBeenCalledWith(auth, {
            id: 'skrot-w-podfolderze',
            name: '123 Opis pisma',
        });
    });
});
