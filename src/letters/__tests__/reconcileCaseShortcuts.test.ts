import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../../tools/ToolsGd';
import { CaseData, LetterData } from '../../types/types';
import { reconcileCaseShortcuts } from '../resolveShortcutParentId';

jest.mock('../../tools/ToolsGd');

const auth = {} as OAuth2Client;

const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

const makeCase = (id: number, extra: Record<string, unknown> = {}): CaseData =>
    ({
        id,
        gdFolderId: `case-folder-${id}`,
        ...extra,
    } as unknown as CaseData);

const makeLetter = (
    cases: CaseData[],
    extra: Record<string, unknown> = {}
): LetterData =>
    ({
        id: 6119,
        number: 6119,
        description: 'Opis pisma',
        gdDocumentId: 'doc-1',
        gdFolderId: 'letter-folder-1',
        _project: { id: 1 },
        _cases: cases,
        ...extra,
    } as unknown as LetterData);

/** skróty widziane na Dysku, indeksowane po celu */
let shortcutsByTarget: Record<string, any[]>;
/** metadane zwracane przy odczycie skrótu przed skasowaniem */
let metaById: Record<string, any>;

const registerShortcut = (shortcut: {
    id: string;
    name?: string;
    parents: string[];
    targetId: string;
    mimeType?: string;
}) => {
    const { id, name = 'skrót', parents, targetId } = shortcut;
    shortcutsByTarget[targetId] = [
        ...(shortcutsByTarget[targetId] || []),
        { id, name, parents },
    ];
    metaById[id] = {
        id,
        name,
        mimeType: shortcut.mimeType ?? SHORTCUT_MIME,
        parents,
        trashed: false,
        shortcutDetails: { targetId },
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    shortcutsByTarget = {};
    metaById = {};

    (ToolsGd.findShortcutsByTarget as jest.Mock).mockImplementation(
        async (_auth: OAuth2Client, targetId: string) =>
            shortcutsByTarget[targetId] || []
    );
    (ToolsGd.getShortcutMetaData as jest.Mock).mockImplementation(
        async (_auth: OAuth2Client, id: string) => {
            if (!metaById[id]) throw new Error(`brak pliku ${id}`);
            return metaById[id];
        }
    );
    (ToolsGd.trashFile as jest.Mock).mockResolvedValue('ok');
    (ToolsGd.createShortcut as jest.Mock).mockResolvedValue({ id: 'nowy' });
});

describe('reconcileCaseShortcuts — ścieżka szczęśliwa', () => {
    it('przepięcie: zakłada skrót w nowej sprawie i kasuje go w starej', async () => {
        registerShortcut({
            id: 'skrot-stary',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
            makeCase(10),
        ]);

        expect(ToolsGd.createShortcut).toHaveBeenCalledTimes(1);
        expect(ToolsGd.createShortcut).toHaveBeenCalledWith(auth, {
            targetId: 'doc-1',
            parentId: 'case-folder-20',
            name: '6119 Opis pisma',
        });
        expect(ToolsGd.trashFile).toHaveBeenCalledTimes(1);
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(auth, 'skrot-stary');
    });

    it('dodanie drugiej sprawy bez zdejmowania pierwszej: tworzy jeden skrót i nic nie kasuje', async () => {
        registerShortcut({
            id: 'skrot-pierwszy',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(
            auth,
            makeLetter([makeCase(10), makeCase(20)]),
            [makeCase(10)]
        );

        expect(ToolsGd.createShortcut).toHaveBeenCalledTimes(1);
        expect(ToolsGd.createShortcut).toHaveBeenCalledWith(
            auth,
            expect.objectContaining({ parentId: 'case-folder-20' })
        );
        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('zdjęcie sprawy bez dodania nowej: kasuje skrót i nie tworzy żadnego', async () => {
        registerShortcut({
            id: 'skrot-zdejmowany',
            parents: ['case-folder-20'],
            targetId: 'doc-1',
        });
        registerShortcut({
            id: 'skrot-zostajacy',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(10)]), [
            makeCase(10),
            makeCase(20),
        ]);

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
        expect(ToolsGd.trashFile).toHaveBeenCalledTimes(1);
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(
            auth,
            'skrot-zdejmowany'
        );
    });

    it('przeżywa brak skrótu w zdejmowanej sprawie', async () => {
        await expect(
            reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
                makeCase(10),
            ])
        ).resolves.toBeUndefined();

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
        expect(ToolsGd.createShortcut).toHaveBeenCalledTimes(1);
    });

    it('nic nie robi i nie alarmuje w logu, gdy zestaw spraw się nie zmienił', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await reconcileCaseShortcuts(auth, makeLetter([makeCase(10)]), [
                makeCase(10),
            ]);

            expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
            expect(ToolsGd.trashFile).not.toHaveBeenCalled();
            expect(ToolsGd.findShortcutsByTarget).not.toHaveBeenCalled();
            // Sprawa, której nikt nie zdejmował, nie ma prawa trafić na listę
            // zdejmowanych — inaczej operator dostaje w logu ostrzeżenie
            // o „folderze obsługującym nadal inną sprawę" przy edycji,
            // która spraw w ogóle nie ruszyła.
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('reconcileCaseShortcuts — czego kasować nie wolno', () => {
    it('NIE kasuje skrótu, którego odczytany cel wskazuje inne pismo', async () => {
        // Wyszukiwarka Dysku podaje skrót jako trafienie, ale odczyt celu mówi
        // co innego — to jest dokładnie ten przypadek, w którym kasowanie
        // zabrałoby cudzy skrót.
        shortcutsByTarget['doc-1'] = [
            { id: 'skrot-cudzy', name: 'skrót', parents: ['case-folder-10'] },
        ];
        metaById['skrot-cudzy'] = {
            id: 'skrot-cudzy',
            name: 'skrót',
            mimeType: SHORTCUT_MIME,
            parents: ['case-folder-10'],
            shortcutDetails: { targetId: 'doc-INNEGO-PISMA' },
        };

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
            makeCase(10),
        ]);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE kasuje pliku, który nie jest skrótem', async () => {
        registerShortcut({
            id: 'dokument-oryginal',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
            mimeType: 'application/vnd.google-apps.document',
        });

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
            makeCase(10),
        ]);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE kasuje, gdy odczyt celu skrótu się nie powiódł', async () => {
        shortcutsByTarget['doc-1'] = [
            { id: 'skrot-nieczytelny', parents: ['case-folder-10'] },
        ];
        // brak wpisu w metaById => getShortcutMetaData rzuca

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
            makeCase(10),
        ]);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE kasuje skrótu w folderze, który obsługuje nadal inną sprawę pisma', async () => {
        // Dwie sprawy wskazujące ten sam folder: jedna zdejmowana, druga zostaje.
        const zdejmowana = makeCase(20, { gdFolderId: 'wspolny-folder' });
        const zostajaca = makeCase(10, { gdFolderId: 'wspolny-folder' });
        registerShortcut({
            id: 'skrot-wspolny',
            parents: ['wspolny-folder'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([zostajaca]), [
            zostajaca,
            zdejmowana,
        ]);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE rusza Dysku, gdy payload przyszedł z pustą listą spraw', async () => {
        registerShortcut({
            id: 'skrot-stary',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([]), [makeCase(10)]);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
    });

    it('NIE kasuje skrótu leżącego poza folderem zdejmowanej sprawy', async () => {
        registerShortcut({
            id: 'skrot-prywatny',
            parents: ['folder-roboczy-uzytkownika'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
            makeCase(10),
        ]);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
        // Cudzy skrót nie może nawet trafić na listę kandydatów do skasowania.
        // Warunek końcowy by go obronił, ale zasięg operacji ma być zawężony
        // już przy wyborze, a nie dopiero przy ostatniej bramce.
        expect(ToolsGd.getShortcutMetaData).not.toHaveBeenCalledWith(
            auth,
            'skrot-prywatny'
        );
    });
});

describe('reconcileCaseShortcuts — podfolder „Pisma" i duplikaty', () => {
    const caseInSubfolder = (id: number) =>
        makeCase(id, {
            _parent: { _contract: { lettersShortcutsInSubfolder: true } },
        });

    it('zakłada skrót w podfolderze „Pisma", a nie wprost w folderze sprawy', async () => {
        (ToolsGd.setFolder as jest.Mock).mockResolvedValue({
            id: 'pisma-20',
        });

        await reconcileCaseShortcuts(
            auth,
            makeLetter([caseInSubfolder(20)]),
            []
        );

        expect(ToolsGd.createShortcut).toHaveBeenCalledWith(
            auth,
            expect.objectContaining({ parentId: 'pisma-20' })
        );
    });

    it('kasuje skrót w podfolderze „Pisma" zdejmowanej sprawy, nie zakładając go', async () => {
        (ToolsGd.getFileMetaDataByName as jest.Mock).mockResolvedValue({
            id: 'pisma-10',
        });
        registerShortcut({
            id: 'skrot-w-podfolderze',
            parents: ['pisma-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), [
            caseInSubfolder(10),
        ]);

        expect(ToolsGd.setFolder).not.toHaveBeenCalled();
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(
            auth,
            'skrot-w-podfolderze'
        );
    });

    it('nie dokłada drugiego skrótu, gdy w folderze nowej sprawy już jeden jest', async () => {
        registerShortcut({
            id: 'skrot-juz-jest',
            parents: ['case-folder-20'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, makeLetter([makeCase(20)]), []);

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
    });

    it('nie zakłada skrótów pismu do oferty, ale sprząta po zdjętej sprawie', async () => {
        registerShortcut({
            id: 'skrot-historyczny',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(
            auth,
            makeLetter([makeCase(20)], { _offer: { id: 7 }, _project: undefined }),
            [makeCase(10)]
        );

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(
            auth,
            'skrot-historyczny'
        );
    });
});
