/**
 * TESTY dla ContractsController.createDefaultMilestones()
 *
 * Metoda ma dwie ścieżki:
 *  - BEZ wyboru użytkownika: szablony kamieni z IsDefault (zachowanie sprzed
 *    wprowadzenia drzewa struktury) - to jest strażnik regresji,
 *  - Z wyborem: typy kamieni wskazane w drzewie.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import MilestoneTemplatesController from '../milestones/milestoneTemplates/MilestoneTemplatesController';
import MilestonesController from '../milestones/MilestonesController';
import ContractTemplatesTreeController from '../contractTemplatesTree/ContractTemplatesTreeController';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import Setup from '../../setup/Setup';

jest.mock('../milestones/milestoneTemplates/MilestoneTemplatesController');
jest.mock('../milestones/MilestonesController');
jest.mock('../contractTemplatesTree/ContractTemplatesTreeController');
jest.mock('../../setup/Sessions/IntersessionsTasksStore');

import ContractsController from '../ContractsController';

const auth = {} as any;

const contract = {
    id: 123,
    typeId: 3,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    _type: { id: 3 },
    _ourIdOrNumber_Alias: 'TEST',
} as any;

const milestoneType = (over: any = {}) => ({
    id: 5,
    name: 'Przetarg - obsługa',
    _folderNumber: '01',
    isUniquePerContract: true,
    ...over,
});

describe('ContractsController.createDefaultMilestones()', () => {
    let createdMilestones: any[] = [];
    let bulkOptions: any;

    beforeEach(() => {
        createdMilestones = [];
        bulkOptions = undefined;

        // Setup.scrumSheetSyncEnabled to getter - wyłączamy synchronizację ze
        // Scrumem, żeby test nie wchodził w post-processing arkusza.
        jest.spyOn(Setup, 'scrumSheetSyncEnabled', 'get').mockReturnValue(false);
        (TaskStore.get as any) = jest.fn(() => ({ percent: 0 }));
        (TaskStore.update as any) = jest.fn();

        (MilestonesController.createFolders as any) = jest.fn(
            async (milestone: any) => {
                createdMilestones.push(milestone);
            }
        );
        (MilestonesController.addBulkWithDatesAndCases as any) = jest.fn(
            async (_milestones: any, _auth: any, options: any) => {
                bulkOptions = options;
            }
        );
    });

    describe('ścieżka domyślna (brak wyboru) - strażnik regresji', () => {
        it('pyta o szablony z isDefaultOnly i tworzy kamienie z ich nazw', async () => {
            (MilestoneTemplatesController.find as any) = jest.fn(async () => [
                {
                    name: '',
                    description: 'Inicjacja umowy',
                    _milestoneType: milestoneType({ id: 1 }),
                },
                {
                    name: 'FIDman',
                    description: '',
                    _milestoneType: milestoneType({ id: 15 }),
                },
            ]);

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1'
            );

            expect(MilestoneTemplatesController.find).toHaveBeenCalledWith(
                { isDefaultOnly: true, contractTypeId: 3 },
                'CONTRACT'
            );
            expect(
                ContractTemplatesTreeController.resolveSelection
            ).not.toHaveBeenCalled();
            expect(createdMilestones.map((m) => m.name)).toEqual(['', 'FIDman']);
        });

        it('nie przekazuje wybranych typów spraw - sprawy lecą z szablonów', async () => {
            (MilestoneTemplatesController.find as any) = jest.fn(async () => [
                { name: '', description: '', _milestoneType: milestoneType() },
            ]);

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1'
            );

            // Kamień nie ma wpisu w mapie => createDefaultCases sięgnie po
            // szablony spraw, czyli zachowa się jak przed zmianą.
            expect(
                bulkOptions.caseTypesByMilestone.get(createdMilestones[0])
            ).toBeUndefined();
        });

        it('pusta lista wyboru też prowadzi na ścieżkę domyślną', async () => {
            (MilestoneTemplatesController.find as any) = jest.fn(async () => []);

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1',
                []
            );

            expect(MilestoneTemplatesController.find).toHaveBeenCalled();
            expect(
                ContractTemplatesTreeController.resolveSelection
            ).not.toHaveBeenCalled();
        });
    });

    describe('ścieżka z wyborem z drzewa', () => {
        it('tworzy dokładnie wybrane kamienie i przekazuje ich sprawy', async () => {
            const caseTypeA = { id: 45, isUniquePerMilestone: true } as any;
            (ContractTemplatesTreeController.resolveSelection as any) = jest.fn(
                async () => [
                    {
                        milestoneType: milestoneType({ id: 25 }),
                        name: '',
                        description: '',
                        caseTypes: [
                            {
                                caseType: caseTypeA,
                                name: 'Odpowiedź',
                                description: '',
                            },
                        ],
                    },
                ]
            );

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1',
                [{ milestoneTypeId: 25, caseTypeIds: [45] }]
            );

            expect(
                ContractTemplatesTreeController.resolveSelection
            ).toHaveBeenCalledWith(3, [
                { milestoneTypeId: 25, caseTypeIds: [45] },
            ]);
            expect(MilestoneTemplatesController.find).not.toHaveBeenCalled();
            expect(createdMilestones).toHaveLength(1);
            expect(createdMilestones[0].typeId).toBe(25);

            const forMilestone = bulkOptions.caseTypesByMilestone.get(
                createdMilestones[0]
            );
            expect(forMilestone.map((c: any) => c.caseType.id)).toEqual([45]);
        });

        it('kamień bez wybranych spraw dostaje pustą listę, a nie domyślne', async () => {
            (ContractTemplatesTreeController.resolveSelection as any) = jest.fn(
                async () => [
                    {
                        milestoneType: milestoneType(),
                        name: '',
                        description: '',
                        caseTypes: [],
                    },
                ]
            );

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1',
                [{ milestoneTypeId: 5, caseTypeIds: [] }]
            );

            expect(
                bulkOptions.caseTypesByMilestone.get(createdMilestones[0])
            ).toEqual([]);
        });
    });

    describe('numeracja kamieni typu nieunikalnego', () => {
        it('nadaje kolejne numery kamieniom tego samego typu', async () => {
            const nonUnique = milestoneType({ isUniquePerContract: false });
            (ContractTemplatesTreeController.resolveSelection as any) = jest.fn(
                async () => [
                    {
                        milestoneType: nonUnique,
                        name: 'A',
                        description: '',
                        caseTypes: [],
                    },
                    {
                        milestoneType: nonUnique,
                        name: 'B',
                        description: '',
                        caseTypes: [],
                    },
                ]
            );

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1',
                [
                    { milestoneTypeId: 5, caseTypeIds: [] },
                    { milestoneTypeId: 5, caseTypeIds: [] },
                ]
            );

            expect(createdMilestones.map((m) => m.number)).toEqual([1, 2]);
            // Nazwy folderów muszą się różnić, inaczej ToolsGd.setFolder
            // (find-or-create) podłączyłby oba kamienie pod jeden folder
            const folderNames = createdMilestones.map((m) => m._folderName);
            expect(new Set(folderNames).size).toBe(2);
        });

        it('nie nadaje numeru kamieniom typu unikalnego', async () => {
            (ContractTemplatesTreeController.resolveSelection as any) = jest.fn(
                async () => [
                    {
                        milestoneType: milestoneType(),
                        name: '',
                        description: '',
                        caseTypes: [],
                    },
                ]
            );

            await ContractsController.createDefaultMilestones(
                contract,
                auth,
                'task-1',
                [{ milestoneTypeId: 5, caseTypeIds: [] }]
            );

            expect(createdMilestones[0].number).toBeUndefined();
        });
    });
});
