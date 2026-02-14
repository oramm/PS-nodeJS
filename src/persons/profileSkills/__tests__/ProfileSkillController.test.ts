import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../../tools/ToolsDb';
import ProfileSkillRepository from '../ProfileSkillRepository';
import { PersonProfileSkillV2Payload } from '../../../types/types';

jest.mock('../../../BussinesObject');
jest.mock('../../../tools/ToolsDb');

describe('ProfileSkillController', () => {
    const mockConn = { threadId: 999 } as any;
    const personId = 100;
    const skillEntryId = 42;

    const samplePayload: PersonProfileSkillV2Payload = {
        skillId: 5,
        levelCode: 'advanced',
        yearsOfExperience: 3.5,
        sortOrder: 1,
    };

    const sampleRecord = {
        id: skillEntryId,
        personProfileId: 10,
        _dbTableName: 'PersonProfileSkills',
        ...samplePayload,
        _skill: {
            id: 5,
            name: 'TypeScript',
            nameNormalized: 'typescript',
        },
    } as any;

    beforeEach(async () => {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (...args: any[]) => {
                const callback = args[0] as (conn: any) => Promise<any>;
                return await callback(mockConn);
            },
        );

        const { default: ProfileSkillController } = await import(
            '../ProfileSkillController'
        );
        (ProfileSkillController as any).instance = undefined;
    });

    describe('find', () => {
        it('should call repository.find with personId and return records', async () => {
            const findSpy = jest
                .spyOn(ProfileSkillRepository.prototype, 'find')
                .mockResolvedValue([sampleRecord]);

            const { default: ProfileSkillController } = await import(
                '../ProfileSkillController'
            );
            const result = await ProfileSkillController.find(personId);

            expect(findSpy).toHaveBeenCalledWith(personId);
            expect(result).toEqual([sampleRecord]);
        });

        it('should return empty array when no skills found', async () => {
            const findSpy = jest
                .spyOn(ProfileSkillRepository.prototype, 'find')
                .mockResolvedValue([]);

            const { default: ProfileSkillController } = await import(
                '../ProfileSkillController'
            );
            const result = await ProfileSkillController.find(personId);

            expect(findSpy).toHaveBeenCalledWith(personId);
            expect(result).toEqual([]);
        });
    });

    describe('addFromDto', () => {
        it('should call repository.addSkillInDb within a transaction', async () => {
            const addSpy = jest
                .spyOn(ProfileSkillRepository.prototype, 'addSkillInDb')
                .mockResolvedValue(sampleRecord);

            const { default: ProfileSkillController } = await import(
                '../ProfileSkillController'
            );
            const result = await ProfileSkillController.addFromDto(
                personId,
                samplePayload,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(addSpy).toHaveBeenCalledWith(
                personId,
                samplePayload,
                mockConn,
            );
            expect(result).toEqual(sampleRecord);
        });
    });

    describe('editFromDto', () => {
        it('should call repository.editSkillInDb within a transaction', async () => {
            const editSpy = jest
                .spyOn(ProfileSkillRepository.prototype, 'editSkillInDb')
                .mockResolvedValue(sampleRecord);

            const { default: ProfileSkillController } = await import(
                '../ProfileSkillController'
            );
            const result = await ProfileSkillController.editFromDto(
                personId,
                skillEntryId,
                samplePayload,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(editSpy).toHaveBeenCalledWith(
                personId,
                skillEntryId,
                samplePayload,
                mockConn,
            );
            expect(result).toEqual(sampleRecord);
        });
    });

    describe('deleteFromDto', () => {
        it('should call repository.deleteSkillFromDb within a transaction and return id', async () => {
            const deleteSpy = jest
                .spyOn(ProfileSkillRepository.prototype, 'deleteSkillFromDb')
                .mockResolvedValue(undefined);

            const { default: ProfileSkillController } = await import(
                '../ProfileSkillController'
            );
            const result = await ProfileSkillController.deleteFromDto(
                personId,
                skillEntryId,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(deleteSpy).toHaveBeenCalledWith(
                personId,
                skillEntryId,
                mockConn,
            );
            expect(result).toEqual({ id: skillEntryId });
        });
    });
});
