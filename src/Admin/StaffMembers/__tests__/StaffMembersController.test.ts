/// <reference types="jest" />
/**
 * Pack PER, PER-1: panel uprawnień zapisuje SAME flagi. Rola ma jedną drogę zapisu
 * (PUT /v2/persons/:personId/account), bo tylko ona unieważnia sesje po zmianie roli,
 * zakłada domyślne flagi i kolejkuje push do FIDmana. Test pilnuje, żeby kontroler
 * panelu nigdy nie wrócił do własnego zapisu roli.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import StaffMemberAdminRepository from '../StaffMemberAdminRepository';

jest.mock('../StaffMemberAdminRepository');

import StaffMembersController from '../StaffMembersController';

const PERSON_ID = 613;

const flags = {
    isDriver: false,
    isInScrum: true,
    hasCostInvoiceAccess: false,
    hasBankAccess: false,
    canLogSiteVisits: false,
    isActive: true,
};

describe('StaffMembersController.editFromDto()', () => {
    let repository: any;

    beforeEach(() => {
        jest.clearAllMocks();
        const storedRow = {
            id: PERSON_ID,
            personId: PERSON_ID,
            ...flags,
            _systemRoleId: 3,
            _systemEmail: 'test@envi.com.pl',
            _fidmanEnabled: false,
            _hasStaffRow: true,
        };
        repository = {
            find: jest.fn(() => Promise.resolve([storedRow])),
            upsertInDb: jest.fn(() => Promise.resolve()),
        };
        (StaffMemberAdminRepository as unknown as jest.Mock).mockImplementation(
            () => repository
        );
        // Singleton - inaczej pierwszy test zamroziłby własne repozytorium dla reszty.
        (StaffMembersController as any).instance = undefined;
    });

    it('systemRoleId w treści NIE zmienia roli - zapisuje same flagi', async () => {
        await StaffMembersController.editFromDto({
            personId: PERSON_ID,
            ...flags,
            systemRoleId: 1,
            systemEmail: 'admin@envi.com.pl',
            fidmanEnabled: true,
        });

        expect(repository.upsertInDb).toHaveBeenCalledTimes(1);
        const saved = repository.upsertInDb.mock.calls[0][0];
        expect(saved).toMatchObject({ personId: PERSON_ID, ...flags });
        expect(saved.systemRoleId).toBeUndefined();

        // Jedyny ruch w bazie poza odczytami to upsert flag - żadnego UPDATE roli.
        const usedMethods = Object.keys(repository)
            .filter((method) => repository[method].mock.calls.length > 0)
            .sort();
        expect(usedMethods).toEqual(['find', 'upsertInDb']);
    });

    it('repozytorium panelu nie ma już metody zapisu roli', () => {
        // Automock odwzorowuje prawdziwy kształt klasy: gdyby metoda wróciła do
        // repozytorium, pojawiłaby się tu jako funkcja.
        expect(
            (StaffMemberAdminRepository.prototype as any).updateSystemRoleInDb
        ).toBeUndefined();
    });

    it('oddaje stan po zapisie z e-mailem systemowym i flagą FIDmana', async () => {
        const result = await StaffMembersController.editFromDto({
            personId: PERSON_ID,
            ...flags,
        });

        expect(result).toMatchObject({
            personId: PERSON_ID,
            _systemEmail: 'test@envi.com.pl',
            _fidmanEnabled: false,
        });
        // Odczyt przed (czy osoba istnieje) i po (świeży stan dla klienta).
        expect(repository.find).toHaveBeenCalledTimes(2);
    });

    it('odmawia, gdy osoba nie istnieje, i niczego nie zapisuje', async () => {
        repository.find.mockResolvedValue([]);

        await expect(
            StaffMembersController.editFromDto({ personId: PERSON_ID, ...flags })
        ).rejects.toMatchObject({ status: 400 });
        expect(repository.upsertInDb).not.toHaveBeenCalled();
    });
});
