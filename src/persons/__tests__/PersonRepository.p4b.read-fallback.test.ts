import { afterEach, describe, expect, it, jest } from '@jest/globals';
import PersonRepository from '../PersonRepository';

describe('PersonRepository P4-B remove read fallback', () => {
    const originalReadFlag = process.env.PERSONS_MODEL_V2_READ_ENABLED;

    afterEach(() => {
        process.env.PERSONS_MODEL_V2_READ_ENABLED = originalReadFlag;
        jest.restoreAllMocks();
    });

    it('does not fallback to legacy find path when v2 find fails', async () => {
        process.env.PERSONS_MODEL_V2_READ_ENABLED = 'true';
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
        process.env.PERSONS_MODEL_V2_READ_ENABLED = 'true';
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
});
