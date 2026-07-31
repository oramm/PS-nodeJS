import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../../tools/ToolsGd';
import { CaseData } from '../../types/types';
import {
    LetterShortcutIdentity,
    reconcileCaseShortcuts,
} from '../resolveShortcutParentId';

jest.mock('../../tools/ToolsGd');

const auth = {} as OAuth2Client;

const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

/** Tożsamość pisma tak, jak przychodzi z bazy — nigdy z payloadu. */
const identity = (extra: Partial<LetterShortcutIdentity> = {}) =>
    ({
        id: 6119,
        number: 6119,
        description: 'Opis pisma',
        gdDocumentId: 'doc-1',
        gdFolderId: 'letter-folder-1',
        ...extra,
    } as LetterShortcutIdentity);

const makeCase = (id: number, extra: Record<string, unknown> = {}): CaseData =>
    ({
        id,
        gdFolderId: `case-folder-${id}`,
        ...extra,
    } as unknown as CaseData);

let shortcutsByTarget: Record<string, any[]>;
let metaById: Record<string, any>;

const registerShortcut = (shortcut: {
    id: string;
    name?: string;
    parents: string[];
    targetId: string;
    mimeType?: string;
    trashed?: boolean;
    /** rodzice widziani przy odczycie metadanych — do symulacji rozjazdu */
    metaParents?: string[];
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
        parents: shortcut.metaParents ?? parents,
        trashed: shortcut.trashed ?? false,
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

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

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
            identity(),
            [makeCase(10)],
            [makeCase(10), makeCase(20)]
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

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10), makeCase(20)],
            [makeCase(10)]
        );

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
        expect(ToolsGd.trashFile).toHaveBeenCalledTimes(1);
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(
            auth,
            'skrot-zdejmowany'
        );
    });

    it('przeżywa brak skrótu w zdejmowanej sprawie', async () => {
        await expect(
            reconcileCaseShortcuts(
                auth,
                identity(),
                [makeCase(10)],
                [makeCase(20)]
            )
        ).resolves.toBeUndefined();

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
        expect(ToolsGd.createShortcut).toHaveBeenCalledTimes(1);
    });

    it('nic nie robi i nie alarmuje w logu, gdy zestaw spraw się nie zmienił', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await reconcileCaseShortcuts(
                auth,
                identity(),
                [makeCase(10)],
                [makeCase(10)]
            );

            expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
            expect(ToolsGd.trashFile).not.toHaveBeenCalled();
            expect(ToolsGd.findShortcutsByTarget).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('reconcileCaseShortcuts — czego kasować nie wolno', () => {
    it('NIE kasuje skrótu, którego odczytany cel wskazuje inne pismo', async () => {
        shortcutsByTarget['doc-1'] = [
            { id: 'skrot-cudzy', name: 'skrót', parents: ['case-folder-10'] },
        ];
        metaById['skrot-cudzy'] = {
            id: 'skrot-cudzy',
            name: 'skrót',
            mimeType: SHORTCUT_MIME,
            parents: ['case-folder-10'],
            trashed: false,
            shortcutDetails: { targetId: 'doc-INNEGO-PISMA' },
        };

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    /**
     * Scenariusz z obiegu 2 review. Cele pochodzą z bazy, więc `gdDocumentId`
     * podstawiony przez klienta nie ma jak wskazać cudzego pliku do skasowania:
     * ginie skrót tego pisma, cudzy zostaje.
     */
    it('kasuje skrót pisma wg BAZY i zostawia skrót cudzego pisma w tym samym folderze', async () => {
        registerShortcut({
            id: 'skrot-tego-pisma',
            name: '6119 nasze pismo',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });
        registerShortcut({
            id: 'skrot-cudzego-pisma',
            name: '6100 CUDZE PISMO',
            parents: ['case-folder-10'],
            targetId: 'doc-cudzego-pisma',
        });

        await reconcileCaseShortcuts(
            auth,
            identity({ gdDocumentId: 'doc-1', gdFolderId: 'letter-folder-1' }),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).toHaveBeenCalledTimes(1);
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(
            auth,
            'skrot-tego-pisma'
        );
        expect(ToolsGd.trashFile).not.toHaveBeenCalledWith(
            auth,
            'skrot-cudzego-pisma'
        );
    });

    it('NIE kasuje pliku, który nie jest skrótem', async () => {
        registerShortcut({
            id: 'dokument-oryginal',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
            mimeType: 'application/vnd.google-apps.document',
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE kasuje, gdy odczyt celu skrótu się nie powiódł', async () => {
        shortcutsByTarget['doc-1'] = [
            { id: 'skrot-nieczytelny', parents: ['case-folder-10'] },
        ];

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    /**
     * Wyszukiwarka Dysku podaje skrót jako leżący w folderze sprawy, ale odczyt
     * metadanych mówi co innego (przeniesiony w międzyczasie, nieaktualny indeks).
     * Rozstrzyga odczyt, nie wynik wyszukiwania.
     */
    it('NIE kasuje, gdy odczyt pokazuje skrót w innym folderze niż wynik wyszukiwania', async () => {
        registerShortcut({
            id: 'skrot-przeniesiony',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
            metaParents: ['zupelnie-inny-folder'],
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE kasuje skrótu, który jest już w koszu', async () => {
        registerShortcut({
            id: 'skrot-w-koszu',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
            trashed: true,
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE kasuje skrótu w folderze, który obsługuje nadal inną sprawę pisma', async () => {
        const zdejmowana = makeCase(20, { gdFolderId: 'wspolny-folder' });
        const zostajaca = makeCase(10, { gdFolderId: 'wspolny-folder' });
        registerShortcut({
            id: 'skrot-wspolny',
            parents: ['wspolny-folder'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [zostajaca, zdejmowana],
            [zostajaca]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    /**
     * Nie wiemy, gdzie leżą skróty spraw pozostających, więc nie wiemy też,
     * czego nie wolno ruszyć. Kasowanie musi wtedy stanąć w całości.
     */
    it('wstrzymuje WSZYSTKIE kasowania, gdy nie da się ustalić folderu pozostającej sprawy', async () => {
        const zostajaca = makeCase(10, {
            _parent: { _contract: { lettersShortcutsInSubfolder: true } },
        });
        (ToolsGd.getFileMetaDataByName as jest.Mock).mockRejectedValue(
            new Error('Dysk niedostępny')
        );
        registerShortcut({
            id: 'skrot-zdejmowanej',
            parents: ['case-folder-20'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [zostajaca, makeCase(20)],
            [zostajaca]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
    });

    it('NIE rusza Dysku, gdy w bazie po edycji nie ma żadnej sprawy', async () => {
        registerShortcut({
            id: 'skrot-stary',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(auth, identity(), [makeCase(10)], []);

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
    });

    it('NIE kasuje skrótu leżącego poza folderem zdejmowanej sprawy', async () => {
        registerShortcut({
            id: 'skrot-prywatny',
            parents: ['folder-roboczy-uzytkownika'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [makeCase(10)],
            [makeCase(20)]
        );

        expect(ToolsGd.trashFile).not.toHaveBeenCalled();
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
        (ToolsGd.setFolder as jest.Mock).mockResolvedValue({ id: 'pisma-20' });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [],
            [caseInSubfolder(20)]
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

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [caseInSubfolder(10)],
            [makeCase(20)]
        );

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

        await reconcileCaseShortcuts(auth, identity(), [], [makeCase(20)]);

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
    });

    it('nie zakłada skrótów pismu do oferty, ale sprząta po zdjętej sprawie', async () => {
        const offerCase = (id: number) =>
            makeCase(id, { _parent: { _offer: { id: 7 } } });
        registerShortcut({
            id: 'skrot-historyczny',
            parents: ['case-folder-10'],
            targetId: 'doc-1',
        });

        await reconcileCaseShortcuts(
            auth,
            identity(),
            [offerCase(10)],
            [offerCase(20)]
        );

        expect(ToolsGd.createShortcut).not.toHaveBeenCalled();
        expect(ToolsGd.trashFile).toHaveBeenCalledWith(
            auth,
            'skrot-historyczny'
        );
    });
});
