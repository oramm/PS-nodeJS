import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ContractTemplatesTreeRepository from '../ContractTemplatesTreeRepository';
import ContractTypesController from '../../contractTypes/ContractTypesController';

jest.mock('../ContractTemplatesTreeRepository');
jest.mock('../../contractTypes/ContractTypesController');

import ContractTemplatesTreeController from '../ContractTemplatesTreeController';

const milestoneRow = (over: any = {}) => ({
    milestoneTypeId: 1,
    typeName: 'Administracja',
    folderNumber: '01',
    isDefault: true,
    isUniquePerContract: true,
    templateId: 2,
    templateName: '',
    templateDescription: 'Inicjacja umowy',
    ...over,
});

const caseRow = (over: any = {}) => ({
    caseTypeId: 45,
    milestoneTypeId: 1,
    typeName: 'Inicjacja umowy',
    folderNumber: '01',
    description: '',
    isDefault: true,
    isUniquePerMilestone: true,
    isSubCaseOnly: false,
    templateId: 1,
    templateName: '',
    templateDescription: 'Wykonaj procedurę',
    ...over,
});

describe('ContractTemplatesTreeController', () => {
    let findMilestoneTypes: any;
    let findCaseTypes: any;

    beforeEach(() => {
        jest.clearAllMocks();
        findMilestoneTypes = jest.fn(() => Promise.resolve([] as any[]));
        findCaseTypes = jest.fn(() => Promise.resolve([] as any[]));
        (ContractTemplatesTreeRepository as jest.Mock).mockImplementation(
            () => ({ findMilestoneTypes, findCaseTypes })
        );
        // Repozytorium jest polem statycznym - podmieniamy je po zamockowaniu klasy
        (ContractTemplatesTreeController as any).repository = {
            findMilestoneTypes,
            findCaseTypes,
        };
        (ContractTypesController.find as any) = jest.fn(() =>
            Promise.resolve([{ id: 1, name: 'IK', isOur: true }])
        );
    });

    describe('findTree() - reguła zaznaczenia startowego', () => {
        it('zaznacza pozycję mającą IsDefault ORAZ szablon', async () => {
            findMilestoneTypes.mockResolvedValue([milestoneRow()]);
            findCaseTypes.mockResolvedValue([caseRow()]);

            const tree = await ContractTemplatesTreeController.findTree(1);

            expect(tree.milestoneTypes[0].isCheckedByDefault).toBe(true);
            expect(tree.milestoneTypes[0].caseTypes[0].isCheckedByDefault).toBe(
                true
            );
        });

        it('typ z IsDefault, ale BEZ szablonu jest widoczny i odznaczony', async () => {
            // Realny przypadek: umowa SW, kamień „Ocena formalna"
            findMilestoneTypes.mockResolvedValue([
                milestoneRow({
                    milestoneTypeId: 25,
                    typeName: 'Ocena formalna',
                    templateId: null,
                    templateName: '',
                    templateDescription: '',
                }),
            ]);
            findCaseTypes.mockResolvedValue([
                caseRow({
                    caseTypeId: 108,
                    milestoneTypeId: 25,
                    typeName: 'Odpowiedź',
                    templateId: null,
                }),
            ]);

            const tree = await ContractTemplatesTreeController.findTree(7);

            expect(tree.milestoneTypes).toHaveLength(1);
            expect(tree.milestoneTypes[0].isDefault).toBe(true);
            expect(tree.milestoneTypes[0].hasTemplate).toBe(false);
            expect(tree.milestoneTypes[0].isCheckedByDefault).toBe(false);
            expect(tree.milestoneTypes[0].caseTypes[0].isCheckedByDefault).toBe(
                false
            );
        });

        it('typ bez IsDefault, ale z szablonem, też jest odznaczony', async () => {
            findMilestoneTypes.mockResolvedValue([
                milestoneRow({ isDefault: false }),
            ]);

            const tree = await ContractTemplatesTreeController.findTree(1);

            expect(tree.milestoneTypes[0].hasTemplate).toBe(true);
            expect(tree.milestoneTypes[0].isCheckedByDefault).toBe(false);
        });

        it('typ kamienia bez typów spraw dostaje pustą listę', async () => {
            findMilestoneTypes.mockResolvedValue([milestoneRow()]);
            findCaseTypes.mockResolvedValue([]);

            const tree = await ContractTemplatesTreeController.findTree(1);

            expect(tree.milestoneTypes[0].caseTypes).toEqual([]);
        });
    });

    describe('findTree() - foldery opcjonalne', () => {
        it('umowa ENVI nie dostaje Wniosków Materiałowych', async () => {
            const tree = await ContractTemplatesTreeController.findTree(1);
            expect(tree.optionalFolders.map((f) => f.key)).toEqual([
                'MEETING_PROTOCOLS',
            ]);
        });

        it('umowa zewnętrzna dostaje oba foldery', async () => {
            (ContractTypesController.find as any).mockResolvedValue([
                { id: 3, name: 'Żółty', isOur: false },
            ]);

            const tree = await ContractTemplatesTreeController.findTree(3);

            expect(tree.optionalFolders.map((f) => f.key)).toEqual([
                'MEETING_PROTOCOLS',
                'MATERIAL_CARDS',
            ]);
        });

        it('rzuca dla nieistniejącego typu umowy', async () => {
            (ContractTypesController.find as any).mockResolvedValue([]);

            await expect(
                ContractTemplatesTreeController.findTree(999)
            ).rejects.toThrow('Nie znaleziono typu umowy');
        });
    });

    describe('resolveSelection()', () => {
        it('zwraca tylko wybrane typy, z nazwą i opisem z szablonu', async () => {
            findMilestoneTypes.mockResolvedValue([
                milestoneRow({ milestoneTypeId: 1 }),
                milestoneRow({ milestoneTypeId: 2, typeName: 'Gwarancja' }),
            ]);
            findCaseTypes.mockResolvedValue([
                caseRow({ caseTypeId: 45, milestoneTypeId: 1 }),
                caseRow({ caseTypeId: 46, milestoneTypeId: 1 }),
            ]);

            const resolved =
                await ContractTemplatesTreeController.resolveSelection(1, [
                    { milestoneTypeId: 1, caseTypeIds: [46] },
                ]);

            expect(resolved).toHaveLength(1);
            expect(resolved[0].milestoneType.id).toBe(1);
            expect(resolved[0].description).toBe('Inicjacja umowy');
            expect(resolved[0].caseTypes.map((c) => c.caseType.id)).toEqual([
                46,
            ]);
            expect(resolved[0].caseTypes[0].description).toBe(
                'Wykonaj procedurę'
            );
        });

        it('nie ustawia _processes - obie ścieżki mają tworzyć to samo', async () => {
            // Ścieżka po szablonach też ich nie ustawia; wypełnienie ich tutaj
            // włączyłoby tworzenie instancji procesów tylko dla drzewa.
            findMilestoneTypes.mockResolvedValue([milestoneRow()]);
            findCaseTypes.mockResolvedValue([caseRow()]);

            const resolved =
                await ContractTemplatesTreeController.resolveSelection(1, [
                    { milestoneTypeId: 1, caseTypeIds: [45] },
                ]);

            expect(resolved[0].caseTypes[0].caseType._processes).toEqual([]);
        });

        it('typ bez szablonu daje pustą nazwę - kamień i tak powstanie', async () => {
            findMilestoneTypes.mockResolvedValue([
                milestoneRow({
                    milestoneTypeId: 25,
                    templateId: null,
                    templateName: '',
                    templateDescription: '',
                }),
            ]);

            const resolved =
                await ContractTemplatesTreeController.resolveSelection(7, [
                    { milestoneTypeId: 25, caseTypeIds: [] },
                ]);

            expect(resolved[0].name).toBe('');
            expect(resolved[0].milestoneType.id).toBe(25);
        });

        it('cicho odrzuca pozycje spoza typu umowy, gdy zostaje choć jedna', async () => {
            findMilestoneTypes.mockResolvedValue([milestoneRow()]);

            const resolved =
                await ContractTemplatesTreeController.resolveSelection(1, [
                    { milestoneTypeId: 1, caseTypeIds: [] },
                    { milestoneTypeId: 999, caseTypeIds: [] },
                ]);

            expect(resolved.map((r) => r.milestoneType.id)).toEqual([1]);
        });

        it('rzuca, gdy ŻADNA pozycja nie pasuje do typu umowy', async () => {
            findMilestoneTypes.mockResolvedValue([milestoneRow()]);

            await expect(
                ContractTemplatesTreeController.resolveSelection(1, [
                    { milestoneTypeId: 999, caseTypeIds: [] },
                ])
            ).rejects.toThrow('nie pasują do typu umowy');
        });
    });

    describe('parseSelection() - sanityzacja wyboru z żądania', () => {
        it('scala powtórzony typ kamienia w jeden wpis', () => {
            // Bez tego dwa kamienie o tej samej nazwie naruszyłyby
            // UNIQUE (TypeId, Name, ContractId) i rolbackowały całą rejestrację.
            expect(
                ContractTemplatesTreeController.parseSelection([
                    { milestoneTypeId: 5, caseTypeIds: [1, 2] },
                    { milestoneTypeId: 5, caseTypeIds: [2, 3] },
                ])
            ).toEqual([{ milestoneTypeId: 5, caseTypeIds: [1, 2, 3] }]);
        });

        it('odsiewa id, które nie są dodatnimi liczbami', () => {
            // Number(null) === 0, więc samo Number.isInteger by je przepuściło
            expect(
                ContractTemplatesTreeController.parseSelection([
                    { milestoneTypeId: 'abc', caseTypeIds: [1] },
                    { milestoneTypeId: 0, caseTypeIds: [1] },
                    { milestoneTypeId: 7, caseTypeIds: [4, 4, 'x', null, -2] },
                ])
            ).toEqual([{ milestoneTypeId: 7, caseTypeIds: [4] }]);
        });

        it('brak pola, zły kształt i pusta lista prowadzą na ścieżkę domyślną', () => {
            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);
            try {
                expect(
                    ContractTemplatesTreeController.parseSelection(undefined)
                ).toBeUndefined();
                expect(
                    ContractTemplatesTreeController.parseSelection('nonsens')
                ).toBeUndefined();
                expect(
                    ContractTemplatesTreeController.parseSelection([])
                ).toBeUndefined();
            } finally {
                warn.mockRestore();
            }
        });
    });
});
