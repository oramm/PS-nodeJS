import { SystemRoleName, UserData } from '../../types/sessionTypes';

jest.mock('../../tools/ToolsDb');
jest.mock('../associations/LetterCaseAssociationsController');
jest.mock('../associations/LetterEntityAssociationsController');

import ToolsDb from '../../tools/ToolsDb';
import LetterCaseAssociationsController from '../associations/LetterCaseAssociationsController';
import LetterEntityAssociationsController from '../associations/LetterEntityAssociationsController';
import LetterRepository from '../LetterRepository';
import { AGENT_SYSTEM_EMAIL } from '../../setup/Sessions/agentTokenAuth';

/**
 * Znacznik „założył agent” jest faktem historycznym, nie stanem pisma.
 * Autorstwo wiersza przechodzi na człowieka przy zatwierdzeniu
 * (decyzja: autorstwo-pisma-przechodzi-przy-zatwierdzeniu), a ostatnie zdarzenie
 * po zatwierdzeniu wskazuje zatwierdzającego. Flaga musi więc czytać WYŁĄCZNIE
 * tożsamość autora zdarzenia utworzenia.
 */

const USER: UserData = {
    enviId: 125,
    googleId: 'g-125',
    systemEmail: 'oramwp@gmail.com',
    userName: 'Marek Gazda',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
} as UserData;

const HUMAN_EMAIL = 'oramwp@gmail.com';

/** Wiersz rejestru w kształcie, w jakim oddaje go zapytanie listy pism. */
function letterRow(params: {
    id: number;
    number: number;
    creationEventEditorSystemEmail: string | null;
    lastEventType: string;
    lastEventEditorEmail: string;
}) {
    return {
        Id: params.id,
        Number: params.number,
        IsOur: 1,
        Description: 'Pismo testowe',
        CreationDate: '2026-07-31',
        RegistrationDate: '2026-07-31',
        GdDocumentId: null,
        GdFolderId: null,
        Status: 'CREATED',
        LetterFilesCount: 0,
        LastUpdated: '2026-07-31 10:00:00',
        RelatedLetterNumber: null,
        ResponseDueDate: null,
        ResponseIKNumber: null,
        AddedToApprovedDocumentation: 0,
        ProjectId: 1,
        ProjectOurId: '2026.01',
        ProjectGdFolderId: 'gd-project',
        LettersGdFolderId: 'gd-letters',
        OfferId: null,
        LastEventId: 900 + params.id,
        LastEventType: params.lastEventType,
        LastEventComment: null,
        LastEventAdditionalMessage: null,
        LastEventVersionNumber: 1,
        LastEventDate: '2026-07-31 10:00:00',
        LastEventGdFilesJSON: null,
        LastEventRecipientsJSON: null,
        LastEventEditorId: 1,
        LastEventEditorName: 'Kto',
        LastEventEditorSurname: 'Kolwiek',
        LastEventEditorEmail: params.lastEventEditorEmail,
        CreationEventEditorSystemEmail: params.creationEventEditorSystemEmail,
    };
}

/** Pismo agenta, jeszcze niezatwierdzone: ostatnie zdarzenie to CREATED agenta. */
const AGENT_LETTER = letterRow({
    id: 6166,
    number: 6166,
    creationEventEditorSystemEmail: AGENT_SYSTEM_EMAIL,
    lastEventType: 'CREATED',
    lastEventEditorEmail: AGENT_SYSTEM_EMAIL,
});

/** Pismo człowieka. */
const HUMAN_LETTER = letterRow({
    id: 6167,
    number: 6167,
    creationEventEditorSystemEmail: HUMAN_EMAIL,
    lastEventType: 'CREATED',
    lastEventEditorEmail: HUMAN_EMAIL,
});

/**
 * Właściwy przypadek tego checkpointu: pismo założone przez agenta i zatwierdzone
 * przez człowieka. Ostatnie zdarzenie i autor wiersza wskazują już człowieka.
 */
const AGENT_LETTER_APPROVED_BY_HUMAN = letterRow({
    id: 6168,
    number: 6168,
    creationEventEditorSystemEmail: AGENT_SYSTEM_EMAIL,
    lastEventType: 'APPROVED',
    lastEventEditorEmail: HUMAN_EMAIL,
});

describe('flaga _isCreatedByAgent w rejestrze pism', () => {
    let repository: LetterRepository;
    let capturedSql = '';

    beforeEach(() => {
        jest.clearAllMocks();
        repository = new LetterRepository();

        (ToolsDb.makeOrGroupsConditions as jest.Mock).mockReturnValue('1');
        (ToolsDb.sqlToString as jest.Mock).mockImplementation(
            (value: any) => value,
        );
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(
            async (sql: string) => {
                capturedSql = sql;
                return [
                    AGENT_LETTER,
                    HUMAN_LETTER,
                    AGENT_LETTER_APPROVED_BY_HUMAN,
                ];
            },
        );
        (LetterCaseAssociationsController.find as jest.Mock).mockResolvedValue(
            [],
        );
        (
            LetterEntityAssociationsController.getLetterEntityAssociationsList as jest.Mock
        ).mockResolvedValue([]);
    });

    const findLetters = () =>
        repository.find({
            orConditions: [{}],
            milestoneParentType: 'CONTRACT',
            userData: USER,
        } as any);

    it('pismo założone przez agenta ma flagę true, pismo człowieka false', async () => {
        const letters = await findLetters();

        const byId = new Map(letters.map((l) => [l.id, l]));
        expect(byId.get(6166)?._isCreatedByAgent).toBe(true);
        expect(byId.get(6167)?._isCreatedByAgent).toBe(false);
    });

    it('flaga zostaje true po zatwierdzeniu pisma przez człowieka', async () => {
        // Autorstwo przeszło na człowieka, ostatnie zdarzenie to APPROVED człowieka —
        // a mimo to rejestr ma dalej pokazywać, że wpis założył agent.
        const letters = await findLetters();
        const approved = letters.find((l) => l.id === 6168);

        expect(approved?._lastEvent?.eventType).toBe('APPROVED');
        expect(approved?._lastEvent?._editor?.email).toBe(HUMAN_EMAIL);
        expect(approved?._isCreatedByAgent).toBe(true);
    });

    it('nie liczy flagi z autora ostatniego zdarzenia', async () => {
        // Odwrotny układ: pismo założył człowiek, ale ostatnie zdarzenie jest agenta
        // (np. automatyczna zmiana). Flaga historyczna musi zostać false.
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([
            letterRow({
                id: 6169,
                number: 6169,
                creationEventEditorSystemEmail: HUMAN_EMAIL,
                lastEventType: 'CHANGED',
                lastEventEditorEmail: AGENT_SYSTEM_EMAIL,
            }),
        ]);

        const letters = await findLetters();

        expect(letters[0]._isCreatedByAgent).toBe(false);
    });

    it('brak zdarzenia utworzenia daje false, nie wysypuje zapytania', async () => {
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([
            letterRow({
                id: 6170,
                number: 6170,
                creationEventEditorSystemEmail: null,
                lastEventType: 'SENT',
                lastEventEditorEmail: HUMAN_EMAIL,
            }),
        ]);

        const letters = await findLetters();

        expect(letters[0]._isCreatedByAgent).toBe(false);
    });

    it('tożsamość agenta rozstrzyga SystemEmail, nie zaszyte Id konta', async () => {
        // Id konta agenta jest inne lokalnie i na produkcji — zapytanie nie może
        // porównywać po Persons.Id.
        await findLetters();

        expect(capturedSql).toContain('SystemEmail');
        expect(capturedSql).not.toMatch(/EditorId\s*=\s*\d+/);
    });

    it('zapytanie sięga po zdarzenie utworzenia osobnym złączeniem', async () => {
        // Bezpiecznik na mutację „licz z ostatniego zdarzenia”: złączenie z ostatnim
        // zdarzeniem używa MAX(Id) bez filtra typu, to tutaj musi być MIN(Id) po CREATED.
        await findLetters();

        expect(capturedSql).toContain("EventType = 'CREATED'");
        expect(capturedSql).toContain('MIN(Id) AS CreationEventId');
        expect(capturedSql).toContain('CreationEventEditorSystemEmail');
    });
});
