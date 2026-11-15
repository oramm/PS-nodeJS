/**
 * UPR-2: wyłączone konto wychodzi ze wszystkich pokoi Google Chat założonych przez PS.
 * Google (ToolsChat) i baza są atrapami - żadne wywołanie nie wychodzi na zewnątrz.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../setup/Sessions/ToolsChat');
jest.mock('../../../tools/ToolsMail');

import ToolsChat from '../../../setup/Sessions/ToolsChat';
import ToolsMail from '../../../tools/ToolsMail';
import ChatSpaceRepository from '../ChatSpaceRepository';
import ChatSpacesController from '../ChatSpacesController';

const removeMember = ToolsChat.removeMember as jest.Mock<any>;
const report = ToolsMail.sendServerErrorReport as jest.Mock<any>;

describe('ChatSpacesController.removeFromAllSpaces (UPR-2)', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        process.env.CHAT_MEMBER_SYNC = 'true';
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        report.mockResolvedValue(undefined);
        removeMember.mockResolvedValue('REMOVED');
        jest.spyOn(ChatSpaceRepository.prototype, 'listSpaces').mockResolvedValue([
            { id: 1, googleName: 'spaces/A' }, { id: 2, googleName: 'spaces/B' },
        ] as any);
    });
    afterEach(() => {
        delete process.env.CHAT_MEMBER_SYNC;
    });

    function person(email: string | null) {
        return jest.spyOn(ChatSpaceRepository.prototype, 'getGoogleEmails').mockResolvedValue(
            [{ personId: 5, email, displayName: 'Jan Nowak', systemRoleName: 'ENVI_EMPLOYEE', isActive: false }] as any,
        );
    }

    it('usuwa z każdego pokoju PS - także pracownika ENVI; czyta adres konta nieaktywnego', async () => {
        const emails = person('Jan.Nowak@envi.com.pl');
        await ChatSpacesController.removeFromAllSpaces(5);
        expect(emails).toHaveBeenCalledWith([5], true);
        expect(removeMember.mock.calls).toEqual([
            ['spaces/A', 'jan.nowak@envi.com.pl'],
            ['spaces/B', 'jan.nowak@envi.com.pl'],
        ]);
        expect(report).not.toHaveBeenCalled();
    });

    it('błąd jednego pokoju nie zatrzymuje reszty i trafia do zgłoszeń', async () => {
        person('jan@envi.com.pl');
        removeMember.mockRejectedValueOnce(new Error('403'));
        await expect(ChatSpacesController.removeFromAllSpaces(5)).resolves.toBeUndefined();
        expect(removeMember).toHaveBeenCalledTimes(2);
        expect(report).toHaveBeenCalledTimes(1);
    });

    it('osoba bez adresu logowania - nic do usunięcia', async () => {
        person(null);
        await ChatSpacesController.removeFromAllSpaces(5);
        expect(removeMember).not.toHaveBeenCalled();
    });

    it('poza produkcją bez CHAT_MEMBER_SYNC nie woła Google (kopia bazy ma prawdziwe pokoje)', async () => {
        delete process.env.CHAT_MEMBER_SYNC;
        person('jan@envi.com.pl');
        await ChatSpacesController.removeFromAllSpaces(5);
        expect(removeMember).not.toHaveBeenCalled();
    });
});
