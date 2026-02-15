import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../../tools/ToolsDb';
import SkillsDictionaryRepository from '../SkillsDictionaryRepository';
import { SkillDictionaryPayload } from '../../../types/types';

jest.mock('../../../BussinesObject');
jest.mock('../../../tools/ToolsDb');

describe('SkillsDictionaryController', () => {
    const mockConn = { threadId: 999 } as any;
    const skillId = 5;

    const samplePayload: SkillDictionaryPayload = {
        name: 'TypeScript',
    };

    const sampleRecord = {
        id: skillId,
        name: 'TypeScript',
        nameNormalized: 'typescript',
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (...args: any[]) => {
                const callback = args[0] as (conn: any) => Promise<any>;
                return await callback(mockConn);
            },
        );

        const { default: SkillsDictionaryController } = await import(
            '../SkillsDictionaryController'
        );
        (SkillsDictionaryController as any).instance = undefined;
    });

    describe('find', () => {
        it('should return all skills when no search params', async () => {
            const findSpy = jest
                .spyOn(SkillsDictionaryRepository.prototype, 'find')
                .mockResolvedValue([sampleRecord]);

            const { default: SkillsDictionaryController } = await import(
                '../SkillsDictionaryController'
            );
            const result = await SkillsDictionaryController.find();

            expect(findSpy).toHaveBeenCalledWith(undefined);
            expect(result).toEqual([sampleRecord]);
        });

        it('should pass searchText to repository', async () => {
            const findSpy = jest
                .spyOn(SkillsDictionaryRepository.prototype, 'find')
                .mockResolvedValue([sampleRecord]);

            const { default: SkillsDictionaryController } = await import(
                '../SkillsDictionaryController'
            );
            const result = await SkillsDictionaryController.find({
                searchText: 'Type',
            });

            expect(findSpy).toHaveBeenCalledWith({ searchText: 'Type' });
            expect(result).toEqual([sampleRecord]);
        });
    });

    describe('addFromDto', () => {
        it('should call repository.addSkillInDb within a transaction', async () => {
            const addSpy = jest
                .spyOn(SkillsDictionaryRepository.prototype, 'addSkillInDb')
                .mockResolvedValue(sampleRecord);

            const { default: SkillsDictionaryController } = await import(
                '../SkillsDictionaryController'
            );
            const result = await SkillsDictionaryController.addFromDto(
                samplePayload,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(addSpy).toHaveBeenCalledWith(samplePayload, mockConn);
            expect(result).toEqual(sampleRecord);
        });
    });

    describe('editFromDto', () => {
        it('should call repository.editSkillInDb within a transaction', async () => {
            const editSpy = jest
                .spyOn(SkillsDictionaryRepository.prototype, 'editSkillInDb')
                .mockResolvedValue(sampleRecord);

            const { default: SkillsDictionaryController } = await import(
                '../SkillsDictionaryController'
            );
            const result = await SkillsDictionaryController.editFromDto(
                skillId,
                samplePayload,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(editSpy).toHaveBeenCalledWith(
                skillId,
                samplePayload,
                mockConn,
            );
            expect(result).toEqual(sampleRecord);
        });
    });

    describe('delete', () => {
        it('should call repository.deleteSkillFromDb within a transaction and return id', async () => {
            const deleteSpy = jest
                .spyOn(
                    SkillsDictionaryRepository.prototype,
                    'deleteSkillFromDb',
                )
                .mockResolvedValue(undefined);

            const { default: SkillsDictionaryController } = await import(
                '../SkillsDictionaryController'
            );
            const result = await SkillsDictionaryController.delete(skillId);

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(deleteSpy).toHaveBeenCalledWith(skillId, mockConn);
            expect(result).toEqual({ id: skillId });
        });
    });
});
