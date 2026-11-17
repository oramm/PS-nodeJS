/**
 * UPR-2: wyłączenie konta w PS zabiera wszystko, co PS nadał - sesje, FIN i FIDmana, Second Brain,
 * pokoje Google Chat. Pracownik czynny (zapis bez zmiany aktywności) nie traci niczego.
 * Baza, kolejka FIDmana, sesje, SB i Chat są atrapami - nic nie wychodzi na zewnątrz.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import PersonRepository from '../PersonRepository';
import SessionRevoker from '../../setup/Sessions/SessionRevoker';
import SbAccessController from '../../sbAccess/SbAccessController';
import ChatSpacesController from '../../contracts/chatSpaces/ChatSpacesController';
import { enqueueFidmanUserPush, tryDeliverAfterCommit } from '../../contracts/fidmanSync/FidmanSync';
import PersonsController from '../PersonsController';

jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/ToolsMail');
jest.mock('../accountEvents/PersonAccountEventsController');
jest.mock('../../setup/Sessions/SessionRevoker');
jest.mock('../../sbAccess/SbAccessController');
jest.mock('../../contracts/chatSpaces/ChatSpacesController');
jest.mock('../../contracts/fidmanSync/FidmanSync', () => ({
    ...(jest.requireActual('../../contracts/fidmanSync/FidmanSync') as any),
    enqueueFidmanUserPush: jest.fn(),
    tryDeliverAfterCommit: jest.fn(),
}));

const PERSON_ID = 777;
const ACTOR_ID = 42;
const source = {
    personId: PERSON_ID, entityId: 1, name: 'Jan', surname: 'Nowak',
    systemEmail: 'jan.nowak@envi.com.pl', systemRoleName: 'ENVI_EMPLOYEE', cellphone: '600100200',
};

const revoke = SessionRevoker.revokeForPerson as jest.Mock<any>;
const sbBlock = SbAccessController.blockAfterAccountDeactivation as jest.Mock<any>;
const chatRemove = ChatSpacesController.removeFromAllSpaces as jest.Mock<any>;
const enqueue = enqueueFidmanUserPush as unknown as jest.Mock<any>;

/** Konto sprzed zapisu i po nim (getPersonAccountV2 woła się przed i po transakcji). */
function given(before: Record<string, unknown>, after: Record<string, unknown>) {
    jest.spyOn(PersonRepository.prototype, 'getPersonAccountV2')
        .mockResolvedValueOnce({ personId: PERSON_ID, ...before } as any)
        .mockResolvedValue({ personId: PERSON_ID, ...after } as any);
}

describe('PersonsController.upsertPersonAccountV2 - wyłączenie konta (UPR-2)', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock<any>).mockImplementation(async (work: any) => work({ threadId: 1 }));
        jest.spyOn(PersonRepository.prototype, 'getFidmanUserSourceInConn').mockResolvedValue(source as any);
        jest.spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb').mockResolvedValue(undefined as any);
        enqueue.mockResolvedValue(9001);
        (tryDeliverAfterCommit as unknown as jest.Mock<any>).mockResolvedValue(undefined);
        (PersonsController as any).instance = undefined;
    });

    const active = { isActive: true, systemRoleId: 3, fidmanEnabled: true, finEnabled: true };

    it('wyłączenie gasi sesje, FIDmana i FIN, Second Brain i pokoje Chat', async () => {
        given(active, { ...active, isActive: false });
        await PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, isActive: false }, ACTOR_ID);

        expect(enqueue.mock.calls.map((call) => [call[1], call[3]])).toEqual([[false, 'fidman'], [false, 'fin']]);
        expect(revoke).toHaveBeenCalledWith(PERSON_ID);
        expect(sbBlock).toHaveBeenCalledWith(PERSON_ID, ACTOR_ID);
        expect(chatRemove).toHaveBeenCalledWith(PERSON_ID);
    });

    it('pracownik czynny: zapis konta bez zmiany aktywności nie zabiera niczego (próba pozytywna)', async () => {
        given(active, active);
        await PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, isActive: true, fidmanEnabled: true, finEnabled: true }, ACTOR_ID);

        expect(enqueue.mock.calls.map((call) => call[1])).toEqual([true, true]);
        expect(revoke).not.toHaveBeenCalled();
        expect(sbBlock).not.toHaveBeenCalled();
        expect(chatRemove).not.toHaveBeenCalled();
    });

    it('zapis innego pola przy już wyłączonym koncie nie powtarza skutków', async () => {
        given({ ...active, isActive: false }, { ...active, isActive: false });
        await PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, systemEmail: 'jan.nowak@envi.com.pl' }, ACTOR_ID);

        expect(enqueue).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
        expect(sbBlock).not.toHaveBeenCalled();
        expect(chatRemove).not.toHaveBeenCalled();
    });

    it('ponowne włączenie przywraca FIDmana i FIN, ale SB i pokoi nie rusza', async () => {
        given({ ...active, isActive: false }, active);
        await PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, isActive: true }, ACTOR_ID);

        expect(enqueue.mock.calls.map((call) => [call[1], call[3]])).toEqual([[true, 'fidman'], [true, 'fin']]);
        expect(sbBlock).not.toHaveBeenCalled();
        expect(chatRemove).not.toHaveBeenCalled();
    });

    it('wyzerowanie roli kasuje sesje (odczyt zwraca brak roli jako undefined)', async () => {
        given(active, { ...active, systemRoleId: undefined });
        await PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, systemRoleId: null as any }, ACTOR_ID);

        expect(revoke).toHaveBeenCalledWith(PERSON_ID);
        expect(sbBlock).not.toHaveBeenCalled();
    });

    it('zapis tej samej roli nie kasuje sesji', async () => {
        given(active, active);
        await PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, systemRoleId: 3 }, ACTOR_ID);
        expect(revoke).not.toHaveBeenCalled();
    });

    it.each([0, 'false'])('aktywność konta inna niż true/false (%p) - odmowa 400 przed zapisem', async (value) => {
        given(active, active);
        await expect(
            PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, isActive: value as any }, ACTOR_ID),
        ).rejects.toMatchObject({ status: 400 });
        expect(PersonRepository.prototype.upsertPersonAccountInDb).not.toHaveBeenCalled();
    });

    it('własnego konta nie da się wyłączyć - odmowa 400 przed zapisem', async () => {
        given(active, active);
        await expect(
            PersonsController.upsertPersonAccountV2({ personId: PERSON_ID, isActive: false }, PERSON_ID),
        ).rejects.toMatchObject({ status: 400 });
        expect(PersonRepository.prototype.upsertPersonAccountInDb).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
    });
});
