import { SystemRoleName, UserData } from '../../types/sessionTypes';

jest.mock('../../persons/PersonsController');
jest.mock('../letterEvent/LetterEventsController');

import LettersController from '../LettersController';
import PersonsController from '../../persons/PersonsController';
import LetterEventsController from '../letterEvent/LetterEventsController';
import LetterRepository from '../LetterRepository';

const APPROVER = {
    id: 125,
    name: 'Marek',
    surname: 'Gazda',
} as any;

const APPROVER_SESSION: UserData = {
    enviId: 125,
    googleId: 'g-125',
    systemEmail: 'oramwp@gmail.com',
    userName: 'Marek Gazda',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
} as UserData;

/** Pismo zarejestrowane bezgłowo przez konto agenta — autorem wiersza jest agent (614). */
const agentRegisteredLetter = () =>
    ({
        id: 6166,
        editorId: 614,
        _editor: { id: 614, name: 'Agent', surname: 'automatyczny' },
    } as any);

describe('approveLetter — autorstwo przechodzi na zatwierdzającego', () => {
    let edit: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        (
            PersonsController.getPersonFromSessionUserData as jest.Mock
        ).mockResolvedValue(APPROVER);
        (LetterEventsController.addNew as jest.Mock).mockResolvedValue(
            undefined,
        );
        edit = jest
            .spyOn(LettersController, 'edit')
            .mockResolvedValue(undefined);
    });

    afterEach(() => edit.mockRestore());

    it('przepisuje autora wiersza pisma z agenta na człowieka, który zatwierdził', async () => {
        const letter = agentRegisteredLetter();

        await LettersController.approveLetter(letter, APPROVER_SESSION);

        expect(letter.editorId).toBe(125);
        expect(edit).toHaveBeenCalledWith(letter, ['editorId']);
    });

    it('zapisuje WYŁĄCZNIE kolumnę autora', async () => {
        // Lista pól jest tu bezpiecznikiem, nie kosmetyką: `edit` bez listy pól kasuje
        // i odtwarza wszystkie powiązania pisma (Letters_Cases / Letters_Entities)
        // na podstawie obiektu z payloadu.
        await LettersController.approveLetter(
            agentRegisteredLetter(),
            APPROVER_SESSION,
        );

        const [, fieldsToUpdate] = edit.mock.calls[0];
        expect(fieldsToUpdate).toEqual(['editorId']);
    });

    it('nie rusza historii — zdarzenie APPROVED nadal powstaje osobno', async () => {
        const letter = agentRegisteredLetter();

        await LettersController.approveLetter(letter, APPROVER_SESSION);

        expect(LetterEventsController.addNew).toHaveBeenCalledTimes(1);
        expect(letter._lastEvent.eventType).toBe('APPROVED');
        expect(letter._lastEvent._editor).toBe(APPROVER);
    });

    it('autoApprove() nadal NIE dotyka autorstwa wiersza pisma', () => {
        // Przelot porządkowy dopisuje brakujące zdarzenia APPROVED hurtowo, z zaszytym
        // EditorId 125. Gdyby kiedykolwiek zaczął ruszać `Letters`, jeden przebieg
        // przepisałby autorstwo setek pism na jedną osobę.
        const sql = LetterRepository.prototype.autoApprove.toString();

        expect(sql).toContain('INSERT INTO LetterEvents');
        expect(sql).not.toMatch(/UPDATE\s+Letters\b/i);
        expect(sql).not.toMatch(/INSERT\s+INTO\s+Letters\b/i);
    });
});
