import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import PersonRepository from '../PersonRepository';
import ExperienceRepository from '../experiences/ExperienceRepository';

jest.mock('../../tools/ToolsDb');

describe('PersonsController P3-A v2 dedicated endpoints', () => {
    const mockConn = { threadId: 1001 } as any;

    beforeEach(async () => {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (...args: any[]) => {
                const callback = args[0] as (conn: any) => Promise<any>;
                return await callback(mockConn);
            },
        );

        const { default: PersonsController } = await import('../PersonsController');
        (PersonsController as any).instance = undefined;
    });

    it('upserts account via dedicated v2 path', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);
        const getAccountSpy = jest
            .spyOn(PersonRepository.prototype, 'getPersonAccountV2')
            .mockResolvedValue({
                personId: 310001,
                systemEmail: 'p3a.account@test.local',
                isActive: true,
            });

        const result = await PersonsController.upsertPersonAccountV2({
            personId: 310001,
            systemEmail: 'p3a.account@test.local',
        });

        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 310001,
                systemEmail: 'p3a.account@test.local',
            }),
            mockConn,
            ['systemEmail'],
        );
        expect(getAccountSpy).toHaveBeenCalledWith(310001);
        expect(result).toEqual(
            expect.objectContaining({
                personId: 310001,
                systemEmail: 'p3a.account@test.local',
            }),
        );
    });

    it('upserts profile via dedicated v2 path', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const upsertProfileSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonProfileInDb')
            .mockResolvedValue({
                id: 701,
                personId: 310002,
                headline: 'Platform Engineer',
                summary: 'Profile summary',
                profileIsVisible: true,
            });

        const result = await PersonsController.upsertPersonProfileV2({
            personId: 310002,
            headline: 'Platform Engineer',
            summary: 'Profile summary',
            profileIsVisible: true,
        });

        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(upsertProfileSpy).toHaveBeenCalledWith(
            {
                personId: 310002,
                headline: 'Platform Engineer',
                summary: 'Profile summary',
                profileIsVisible: true,
            },
            mockConn,
        );
        expect(result).toEqual(
            expect.objectContaining({
                personId: 310002,
                headline: 'Platform Engineer',
            }),
        );
    });

    it('creates experience via dedicated v2 path', async () => {
        const { default: ExperienceController } = await import('../experiences/ExperienceController');
        const addExperienceSpy = jest
            .spyOn(ExperienceRepository.prototype, 'addExperienceInDb')
            .mockResolvedValue({
                id: 801,
                personProfileId: 701,
                organizationName: 'ENVI',
                positionName: 'Backend Developer',
                sortOrder: 1,
                isCurrent: true,
            });

        const result = await ExperienceController.addFromDto(
            310003,
            {
                organizationName: 'ENVI',
                positionName: 'Backend Developer',
                isCurrent: true,
                sortOrder: 1,
            },
        );

        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(addExperienceSpy).toHaveBeenCalledWith(
            310003,
            {
                organizationName: 'ENVI',
                positionName: 'Backend Developer',
                isCurrent: true,
                sortOrder: 1,
            },
            mockConn,
        );
        expect(result).toEqual(
            expect.objectContaining({
                id: 801,
                organizationName: 'ENVI',
            }),
        );
    });

    it('findExperiences delegates to ExperienceRepository.find with orConditions', async () => {
        const { default: ExperienceController } = await import('../experiences/ExperienceController');
        const findSpy = jest
            .spyOn(ExperienceRepository.prototype, 'find')
            .mockResolvedValue([
                {
                    id: 801,
                    personProfileId: 701,
                    organizationName: 'ENVI',
                    positionName: 'Backend Developer',
                    isCurrent: true,
                    sortOrder: 1,
                } as any,
            ]);

        const result = await ExperienceController.find(
            310003,
            [{ searchText: 'ENVI' }],
        );

        expect(findSpy).toHaveBeenCalledWith(310003, [{ searchText: 'ENVI' }]);
        expect(result).toEqual([
            expect.objectContaining({
                id: 801,
                organizationName: 'ENVI',
            }),
        ]);
    });

    it('findExperiences works with empty orConditions', async () => {
        const { default: ExperienceController } = await import('../experiences/ExperienceController');
        const findSpy = jest
            .spyOn(ExperienceRepository.prototype, 'find')
            .mockResolvedValue([]);

        const result = await ExperienceController.find(310003, []);

        expect(findSpy).toHaveBeenCalledWith(310003, []);
        expect(result).toEqual([]);
    });
});
