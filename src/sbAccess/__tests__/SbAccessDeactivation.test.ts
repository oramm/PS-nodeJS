/**
 * UPR-2: wyłączone konto PS traci SB tą samą blokadą co z ekranu „Dostępy SB”. Blokada (GitHub,
 * Dysk) jest atrapą - tu sprawdzamy, kiedy jest wołana i że błąd nie wywraca wyłączenia konta.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsMail from '../../tools/ToolsMail';
import SbAccessRepository from '../SbAccessRepository';
import SbAccessController from '../SbAccessController';

jest.mock('../../tools/ToolsMail');

const report = ToolsMail.sendServerErrorReport as jest.Mock<any>;

describe('SbAccessController.blockAfterAccountDeactivation (UPR-2)', () => {
    let block: jest.SpiedFunction<typeof SbAccessController.block>;

    function withStatus(statusCode: string | null) {
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(
            (statusCode ? { personId: 5, statusCode } : null) as any,
        );
    }

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        report.mockResolvedValue(undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        block = jest.spyOn(SbAccessController, 'block').mockResolvedValue({ result: 'OK', note: 'ok', state: null } as any);
    });

    it.each(['INVITED', 'ACTIVE', 'BLOCKED'])('stan %s - blokada jak z ekranu, z autorem zmiany', async (status) => {
        withStatus(status);
        await SbAccessController.blockAfterAccountDeactivation(5, 42);
        expect(block).toHaveBeenCalledWith(5, 42);
        expect(report).not.toHaveBeenCalled();
    });

    it.each([null, 'REVOKED'])('bez wpisu albo po odebraniu (%s) nie ma czego blokować', async (status) => {
        withStatus(status);
        await SbAccessController.blockAfterAccountDeactivation(5, 42);
        expect(block).not.toHaveBeenCalled();
    });

    it('niepełna blokada (np. dostęp nadany ręcznie) trafia do zgłoszeń i nie rzuca', async () => {
        withStatus('ACTIVE');
        block.mockRejectedValue(new Error('Ten dostęp nadano ręcznie'));
        await expect(SbAccessController.blockAfterAccountDeactivation(5, null)).resolves.toBeUndefined();
        expect(String((report.mock.calls[0][0] as Error).message)).toContain('nadano ręcznie');
    });

    it('częściowy wynik (GitHub zdjęty, Dysk nie) też trafia do zgłoszeń', async () => {
        withStatus('ACTIVE');
        block.mockResolvedValue({ result: 'PARTIAL', note: 'Dysk: błąd', state: null } as any);
        await SbAccessController.blockAfterAccountDeactivation(5, 42);
        expect(report).toHaveBeenCalledTimes(1);
    });
});
