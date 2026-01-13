/**
 * TESTY dla ContractsController.add()
 *
 * Weryfikacja zgodności z audytem:
 * - Pola DB dla ContractOur i ContractOther
 * - Asocjacje Entity i ContractRange
 * - Operacje Google Drive
 * - Operacje Scrum
 * - Kamienie milowe
 */

import {
    describe,
    it,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import Tools from '../../tools/Tools';
import ContractEntityRepository from '../ContractEntityRepository';
import ContractRangeContractRepository from '../contractRangesContracts/ContractRangeContractRepository';
import CurrentSprintValidator from '../../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';

// Mock wszystkich zależności zewnętrznych
jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/Tools');
jest.mock('../ContractEntityRepository');
jest.mock('../contractRangesContracts/ContractRangeContractRepository');
jest.mock('../../ScrumSheet/CurrentSprintValidator');
jest.mock('../../setup/Sessions/IntersessionsTasksStore');

describe('ContractsController.add() - Audyt pól DB i operacji', () => {
    let mockConn: any;
    let savedContractsData: any = null;
    let savedOurContractsData: any = null;

    beforeEach(() => {
        jest.clearAllMocks();

        savedContractsData = null;
        savedOurContractsData = null;

        // Mock connection
        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };

        // Mock ToolsDb.transaction - wywołuje callback z mockiem connection
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (callback: any) => {
                return await callback(mockConn);
            }
        );

        // Mock ToolsDb.addInDb - przechwytuje dane i zwraca ID
        (ToolsDb.addInDb as any).mockImplementation(
            async (
                tableName: string,
                data: any,
                conn: any,
                isTransaction?: boolean
            ) => {
                if (tableName === 'Contracts') {
                    savedContractsData = { ...data };
                    data.id = 123; // Symuluj auto-increment
                } else if (tableName === 'OurContractsData') {
                    savedOurContractsData = { ...data };
                }
                return data;
            }
        );

        // Mock Tools.cloneOfObject
        (Tools.cloneOfObject as any).mockImplementation((obj: any) => {
            return JSON.parse(JSON.stringify(obj));
        });

        // Mock CurrentSprintValidator
        (CurrentSprintValidator.checkColumns as any).mockResolvedValue(
            undefined
        );

        // Mock TaskStore
        (TaskStore.update as any).mockReturnValue(undefined);

        // Mock repository instances
        const mockEntityRepo = {
            addAssociations: jest.fn(() => Promise.resolve()) as any,
        };
        const mockRangeRepo = {
            addAssociations: jest.fn(() => Promise.resolve()) as any,
        };

        (ContractEntityRepository as jest.Mock).mockImplementation(
            () => mockEntityRepo
        );
        (ContractRangeContractRepository as jest.Mock).mockImplementation(
            () => mockRangeRepo
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('TEST 1: ContractOur - Pola w tabeli Contracts', () => {
        it('powinien zapisać ContractOur z poprawnymi polami w tabeli Contracts', async () => {
            // Ten test będzie weryfikował WYWOŁANIA, nie rzeczywiste obiekty
            // Importujemy dynamicznie aby uniknąć problemów z inicjalizacją
            const ContractsController = (await import('../ContractsController'))
                .default;
            const ContractOur = (await import('../ContractOur')).default;

            // Przygotuj dane testowe
            const contractData = {
                alias: 'TEST-CONTRACT',
                ourId: 'WAW.UR.001',
                _type: { id: 1, name: 'UR', isOur: true },
                typeId: 1,
                number: '001',
                name: 'Testowy kontrakt',
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                value: 100000,
                comment: 'Test comment',
                status: 'Aktywny',
                _project: {
                    id: 1,
                    ourId: 'PRJ-001',
                    gdFolderId: 'gd-folder-project-123',
                },
                projectOurId: 'PRJ-001',
                adminId: 10,
                managerId: 20,
                cityId: 5,
                _contractors: [],
                _engineers: [],
                _employers: [],
                _contractRangesPerContract: [],
            };

            // Stwórz mock contract z metodami
            const mockContract = {
                ...contractData,
                id: undefined,
                isUniquePerProject: jest.fn(() =>
                    Promise.resolve(false)
                ) as any,
                createFolders: jest.fn(() => Promise.resolve()) as any,
                addInScrum: jest.fn(() => Promise.resolve()) as any,
                createDefaultMilestones: jest.fn(() =>
                    Promise.resolve()
                ) as any,
                deleteFolder: jest.fn(() => Promise.resolve()) as any,
                deleteFromScrum: jest.fn(() => Promise.resolve()) as any,
                deleteFromDb: jest.fn(() => Promise.resolve()) as any,
            };

            // Mock instanceof check
            Object.setPrototypeOf(mockContract, ContractOur.prototype);

            // Act
            await ContractsController.add(mockContract as any);

            // Assert - sprawdź co zostało zapisane w tabeli Contracts
            expect(savedContractsData).not.toBeNull();

            // Weryfikacja: pola które POWINNY być w Contracts
            expect(savedContractsData.alias).toBe('TEST-CONTRACT');
            expect(savedContractsData.number).toBe('001');
            expect(savedContractsData.name).toBe('Testowy kontrakt');
            expect(savedContractsData.startDate).toBe('2024-01-01');
            expect(savedContractsData.endDate).toBe('2024-12-31');
            expect(savedContractsData.value).toBe(100000);
            expect(savedContractsData.comment).toBe('Test comment');
            expect(savedContractsData.status).toBe('Aktywny');
            expect(savedContractsData.typeId).toBe(1);
            expect(savedContractsData.projectOurId).toBe('PRJ-001');

            // Weryfikacja: pola które NIE POWINNY być w Contracts (usunięte)
            expect(savedContractsData.ourId).toBeUndefined();
            expect(savedContractsData.managerId).toBeUndefined();
            expect(savedContractsData.adminId).toBeUndefined();
            expect(savedContractsData.cityId).toBeUndefined();
        });

        it('powinien zapisać ContractOur z poprawnymi polami w tabeli OurContractsData', async () => {
            const ContractsController = (await import('../ContractsController'))
                .default;
            const ContractOur = (await import('../ContractOur')).default;

            const contractData = {
                alias: 'TEST-CONTRACT',
                ourId: 'WAW.UR.001',
                _type: { id: 1, name: 'UR', isOur: true },
                typeId: 1,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-123' },
                projectOurId: 'PRJ-001',
                adminId: 10,
                managerId: 20,
                cityId: 5,
                _contractors: [],
                _engineers: [],
                _employers: [],
                _contractRangesPerContract: [],
            };

            const mockContract = {
                ...contractData,
                id: undefined,
                isUniquePerProject: jest.fn(() =>
                    Promise.resolve(false)
                ) as any,
                createFolders: jest.fn(() => Promise.resolve()) as any,
                addInScrum: jest.fn(() => Promise.resolve()) as any,
                createDefaultMilestones: jest.fn(() =>
                    Promise.resolve()
                ) as any,
                deleteFolder: jest.fn(() => Promise.resolve()) as any,
                deleteFromScrum: jest.fn(() => Promise.resolve()) as any,
                deleteFromDb: jest.fn(() => Promise.resolve()) as any,
            };

            Object.setPrototypeOf(mockContract, ContractOur.prototype);

            // Act
            await ContractsController.add(mockContract as any);

            // Assert - sprawdź OurContractsData
            expect(savedOurContractsData).not.toBeNull();
            expect(savedOurContractsData._isIdNonIncrement).toBe(true);
            expect(savedOurContractsData.id).toBe(123); // ID z Contracts
            expect(savedOurContractsData.ourId).toBe('WAW.UR.001');
            expect(savedOurContractsData.adminId).toBe(10);
            expect(savedOurContractsData.managerId).toBe(20);
            expect(savedOurContractsData.cityId).toBe(5);
        });
    });
});
