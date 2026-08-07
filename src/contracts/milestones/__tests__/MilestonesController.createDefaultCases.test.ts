/**
 * TESTY dla MilestonesController.createDefaultCases()
 *
 * Dwie ścieżki:
 *  - BEZ wybranych typów spraw: szablony spraw z IsDefault (zachowanie sprzed
 *    drzewa struktury; z tej ścieżki korzystają też Oferty) - strażnik regresji,
 *  - Z wybranymi typami: dokładnie te sprawy, bez odpytywania szablonów.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import CaseTemplateRepository from '../cases/caseTemplates/CaseTemplateRepository';
import CasesController from '../cases/CasesController';

jest.mock('../cases/caseTemplates/CaseTemplateRepository');
jest.mock('../cases/CasesController');

import MilestonesController from '../MilestonesController';

const auth = {} as any;

const milestone = {
    id: 10,
    _type: { id: 5, name: 'Przetarg - obsługa', _folderNumber: '01' },
    _contract: { id: 123, _type: { id: 3 } },
    gdFolderId: 'folder-10',
    _FolderNumber_TypeName_Name: '01 Przetarg',
} as any;

const caseType = (over: any = {}) => ({
    id: 4,
    name: 'Opracowanie/Ocena SIWZ',
    folderNumber: '01',
    isUniquePerMilestone: true,
    _processes: [],
    ...over,
});

describe('MilestonesController.createDefaultCases()', () => {
    let findByMilestoneType: any;
    let addedCases: any[] = [];

    beforeEach(() => {
        addedCases = [];
        findByMilestoneType = jest.fn(() => Promise.resolve([] as any[]));
        (CaseTemplateRepository as jest.Mock).mockImplementation(() => ({
            findByMilestoneType,
        }));
        (CasesController.addBulkWithDefaultTasks as any) = jest.fn(
            async (cases: any[]) => {
                addedCases = cases;
            }
        );
    });

    describe('ścieżka domyślna (brak wybranych typów) - strażnik regresji', () => {
        it('pyta repozytorium szablonów z isDefaultOnly', async () => {
            await MilestonesController.createDefaultCases(milestone, auth, {
                isPartOfBatch: true,
            });

            expect(findByMilestoneType).toHaveBeenCalledWith(5, {
                isDefaultOnly: true,
            });
        });

        it('buduje sprawy z nazw i opisów szablonów', async () => {
            findByMilestoneType.mockResolvedValue([
                {
                    name: '',
                    description: 'sprawa tylko gdy SIWZ w naszym zakresie',
                    _caseType: caseType(),
                },
            ]);

            await MilestonesController.createDefaultCases(milestone, auth);

            expect(addedCases).toHaveLength(1);
            expect(addedCases[0].description).toBe(
                'sprawa tylko gdy SIWZ w naszym zakresie'
            );
            expect(addedCases[0].typeId).toBe(4);
        });
    });

    describe('ścieżka z wyborem z drzewa', () => {
        it('nie odpytuje szablonów i tworzy dokładnie wskazane sprawy', async () => {
            await MilestonesController.createDefaultCases(milestone, auth, {
                isPartOfBatch: true,
                caseTypes: [
                    {
                        caseType: caseType({ id: 7 }) as any,
                        name: 'Pozostałe',
                        description: '',
                    },
                ],
            });

            expect(findByMilestoneType).not.toHaveBeenCalled();
            expect(addedCases).toHaveLength(1);
            expect(addedCases[0].typeId).toBe(7);
            expect(addedCases[0].name).toBe('Pozostałe');
        });

        it('pusta lista typów oznacza zero spraw i żadnego zapytania', async () => {
            await MilestonesController.createDefaultCases(milestone, auth, {
                isPartOfBatch: true,
                caseTypes: [],
            });

            expect(findByMilestoneType).not.toHaveBeenCalled();
            expect(addedCases).toEqual([]);
        });
    });

    describe('numeracja spraw typu nieunikalnego', () => {
        it('nadaje kolejne numery sprawom tego samego typu', async () => {
            const nonUnique = caseType({ isUniquePerMilestone: false });

            await MilestonesController.createDefaultCases(milestone, auth, {
                caseTypes: [
                    { caseType: nonUnique as any, name: 'A', description: '' },
                    { caseType: nonUnique as any, name: 'B', description: '' },
                ],
            });

            expect(addedCases.map((c) => c.number)).toEqual([1, 2]);
        });

        it('nie nadaje numeru sprawom typu unikalnego', async () => {
            await MilestonesController.createDefaultCases(milestone, auth, {
                caseTypes: [
                    {
                        caseType: caseType() as any,
                        name: '',
                        description: '',
                    },
                ],
            });

            expect(addedCases[0].number).toBeUndefined();
        });
    });

    it('rzuca, gdy kamień nie ma typu', async () => {
        await expect(
            MilestonesController.createDefaultCases(
                { ...milestone, _type: {} } as any,
                auth
            )
        ).rejects.toThrow('Milestone type id is not defined');
    });
});
