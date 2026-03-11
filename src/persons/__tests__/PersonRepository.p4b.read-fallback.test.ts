import { afterEach, describe, expect, it, jest } from '@jest/globals';
import Person from '../Person';
import PersonRepository from '../PersonRepository';

describe('PersonRepository P4-B remove read fallback', () => {
    const originalReadFlag = process.env.PERSONS_MODEL_V2_LEGACY_READ;

    afterEach(() => {
        process.env.PERSONS_MODEL_V2_LEGACY_READ = originalReadFlag;
        jest.restoreAllMocks();
    });

    it('does not fallback to legacy find path when v2 find fails', async () => {
        delete process.env.PERSONS_MODEL_V2_LEGACY_READ; // V2 is default when flag is unset
        const repository = new PersonRepository();
        const v2Error = new Error('p4b-v2-find-failure');

        const findV2Spy = jest
            .spyOn(repository as any, 'findV2')
            .mockRejectedValue(v2Error);
        const findLegacySpy = jest
            .spyOn(repository as any, 'findLegacy')
            .mockResolvedValue([]);

        await expect(repository.findByReadFacade([])).rejects.toThrow(
            'p4b-v2-find-failure',
        );

        expect(findV2Spy).toHaveBeenCalledTimes(1);
        expect(findLegacySpy).not.toHaveBeenCalled();
    });

    it('does not fallback to legacy getSystemRole path when v2 getSystemRole returns undefined', async () => {
        delete process.env.PERSONS_MODEL_V2_LEGACY_READ; // V2 is default when flag is unset
        const repository = new PersonRepository();

        const getSystemRoleV2Spy = jest
            .spyOn(repository as any, 'getSystemRoleV2')
            .mockResolvedValue(undefined);
        const getSystemRoleLegacySpy = jest
            .spyOn(repository as any, 'getSystemRoleLegacy')
            .mockResolvedValue({
                id: 1,
                name: 'ENVI_MANAGER',
                personId: 1001,
            });

        const result = await repository.getSystemRoleByReadFacade({
            id: 1001,
        });

        expect(getSystemRoleV2Spy).toHaveBeenCalledTimes(1);
        expect(getSystemRoleLegacySpy).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('find() returns systemEmail from PersonAccounts when Persons.SystemEmail is null (new account upsert scenario)', async () => {
        // Simulates: PUT /v2/persons/:id/account saves to PersonAccounts only.
        // Legacy read would return systemEmail=null (Persons.SystemEmail not set).
        // V2 read uses COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) → returns it correctly.
        delete process.env.PERSONS_MODEL_V2_LEGACY_READ;
        const repository = new PersonRepository();

        const personWithAccountEmail = new Person({
            id: 591,
            name: 'Agcia',
            surname: 'Delskie',
            systemEmail: 'agciadelskie@gmail.com', // from PersonAccounts via COALESCE
            systemRoleId: 5,
            systemRoleName: 'ENVI_USER',
        });
        const personWithNullEmail = new Person({
            id: 591,
            name: 'Agcia',
            surname: 'Delskie',
            systemEmail: null as any, // legacy path: Persons.SystemEmail is null
            systemRoleId: 5,
            systemRoleName: 'ENVI_USER',
        });

        const findV2Spy = jest
            .spyOn(repository as any, 'findV2')
            .mockResolvedValue([personWithAccountEmail]);
        const findLegacySpy = jest
            .spyOn(repository as any, 'findLegacy')
            .mockResolvedValue([personWithNullEmail]);

        const results = await repository.find([{ id: 591 }]);

        expect(findV2Spy).toHaveBeenCalledTimes(1);
        expect(findLegacySpy).not.toHaveBeenCalled();
        expect(results[0].systemEmail).toBe('agciadelskie@gmail.com');
    });
});
