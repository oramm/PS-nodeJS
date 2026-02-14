import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../../tools/ToolsDb';
import EducationRepository from '../EducationRepository';
import { PersonProfileEducationV2Payload } from '../../../types/types';

jest.mock('../../../BussinesObject');
jest.mock('../../../tools/ToolsDb');

describe('EducationController', () => {
    const mockConn = { threadId: 999 } as any;
    const personId = 100;
    const educationId = 42;

    const samplePayload: PersonProfileEducationV2Payload = {
        schoolName: 'Politechnika Warszawska',
        degreeName: 'Magister',
        fieldOfStudy: 'Informatyka',
        dateFrom: '2015-10-01',
        dateTo: '2020-06-30',
        sortOrder: 1,
    };

    const sampleRecord = {
        id: educationId,
        personProfileId: 10,
        _dbTableName: 'PersonProfileEducations',
        ...samplePayload,
    } as any;

    beforeEach(async () => {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (...args: any[]) => {
                const callback = args[0] as (conn: any) => Promise<any>;
                return await callback(mockConn);
            },
        );

        const { default: EducationController } = await import(
            '../EducationController'
        );
        (EducationController as any).instance = undefined;
    });

    describe('find', () => {
        it('should call repository.find with personId and return records', async () => {
            const findSpy = jest
                .spyOn(EducationRepository.prototype, 'find')
                .mockResolvedValue([sampleRecord]);

            const { default: EducationController } = await import(
                '../EducationController'
            );
            const result = await EducationController.find(personId);

            expect(findSpy).toHaveBeenCalledWith(personId);
            expect(result).toEqual([sampleRecord]);
        });

        it('should return empty array when no educations found', async () => {
            const findSpy = jest
                .spyOn(EducationRepository.prototype, 'find')
                .mockResolvedValue([]);

            const { default: EducationController } = await import(
                '../EducationController'
            );
            const result = await EducationController.find(personId);

            expect(findSpy).toHaveBeenCalledWith(personId);
            expect(result).toEqual([]);
        });
    });

    describe('addFromDto', () => {
        it('should call repository.addEducationInDb within a transaction', async () => {
            const addSpy = jest
                .spyOn(EducationRepository.prototype, 'addEducationInDb')
                .mockResolvedValue(sampleRecord);

            const { default: EducationController } = await import(
                '../EducationController'
            );
            const result = await EducationController.addFromDto(
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
        it('should call repository.editEducationInDb within a transaction', async () => {
            const editSpy = jest
                .spyOn(EducationRepository.prototype, 'editEducationInDb')
                .mockResolvedValue(sampleRecord);

            const { default: EducationController } = await import(
                '../EducationController'
            );
            const result = await EducationController.editFromDto(
                personId,
                educationId,
                samplePayload,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(editSpy).toHaveBeenCalledWith(
                personId,
                educationId,
                samplePayload,
                mockConn,
            );
            expect(result).toEqual(sampleRecord);
        });
    });

    describe('deleteFromDto', () => {
        it('should call repository.deleteEducationFromDb within a transaction and return id', async () => {
            const deleteSpy = jest
                .spyOn(EducationRepository.prototype, 'deleteEducationFromDb')
                .mockResolvedValue(undefined);

            const { default: EducationController } = await import(
                '../EducationController'
            );
            const result = await EducationController.deleteFromDto(
                personId,
                educationId,
            );

            expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
            expect(deleteSpy).toHaveBeenCalledWith(
                personId,
                educationId,
                mockConn,
            );
            expect(result).toEqual({ id: educationId });
        });
    });
});
