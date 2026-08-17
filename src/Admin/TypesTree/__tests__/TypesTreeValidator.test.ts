/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import TypesTreeValidator from '../TypesTreeValidator';
import { BadRequestError } from '../../../persons/projectAssignments/ProjectScopeGuard';

const baseCaseType = {
    milestoneTypeId: 6,
    name: 'Odcinek',
    folderNumber: '04.03',
};

describe('TypesTreeValidator - typ sprawy', () => {
    it('przyjmuje listę rodziców jako tablicę', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            isSubCaseOnly: true,
            parentCaseTypeIds: [8, 10],
        });
        expect(result.parentCaseTypeIds).toEqual([8, 10]);
    });

    // Tools.parseObjectsJSON woła JSON.parse na każdym polu ciała żądania, więc
    // jednoelementowa tablica [8] dociera tu jako liczba 8. Bez tej tolerancji
    // wybór dokładnie jednej sprawy nadrzędnej kończył się błędem formatu.
    it('przyjmuje pojedynczego rodzica dostarczonego jako liczba', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            isSubCaseOnly: true,
            parentCaseTypeIds: 8,
        });
        expect(result.parentCaseTypeIds).toEqual([8]);
    });

    it('usuwa powtórzenia z listy rodziców', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            isSubCaseOnly: true,
            parentCaseTypeIds: [8, 8, 10],
        });
        expect(result.parentCaseTypeIds).toEqual([8, 10]);
    });

    it('nie pozwala zapisać podsprawy bez rodzica', () => {
        expect(() =>
            TypesTreeValidator.validateNewCaseType({
                ...baseCaseType,
                isSubCaseOnly: true,
                parentCaseTypeIds: [],
            })
        ).toThrow(/co najmniej/);
    });

    it('zwykły typ sprawy nie wymaga rodziców', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            isSubCaseOnly: false,
        });
        expect(result.parentCaseTypeIds).toEqual([]);
    });

    it('odrzuca nieprawidłowe numery na liście', () => {
        expect(() =>
            TypesTreeValidator.validateNewCaseType({
                ...baseCaseType,
                isSubCaseOnly: true,
                parentCaseTypeIds: [8, 'abc'],
            })
        ).toThrow(BadRequestError);
        expect(() =>
            TypesTreeValidator.validateNewCaseType({
                ...baseCaseType,
                isSubCaseOnly: true,
                parentCaseTypeIds: [{ id: 8 }],
            })
        ).toThrow(/nieprawidłowy format/);
    });
});

describe('TypesTreeValidator - szablon sprawy i zadania startowe', () => {
    it('bez danych szablonu zwraca puste wartości, a nie undefined', () => {
        const result = TypesTreeValidator.validateNewCaseType(baseCaseType);
        expect(result.templateName).toBe('');
        expect(result.templateDescription).toBe('');
        expect(result.taskTemplates).toEqual([]);
    });

    it('przycina białe znaki w nazwie i opisie tworzonej sprawy', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            templateName: '  Odcinek robót  ',
            templateDescription: '  opis  ',
        });
        expect(result.templateName).toBe('Odcinek robót');
        expect(result.templateDescription).toBe('opis');
    });

    it('pilnuje limitów kolumn CaseTemplates (160 / 300)', () => {
        expect(() =>
            TypesTreeValidator.validateNewCaseType({
                ...baseCaseType,
                templateName: 'x'.repeat(161),
            })
        ).toThrow(/160 znaków/);
        expect(() =>
            TypesTreeValidator.validateNewCaseType({
                ...baseCaseType,
                templateDescription: 'x'.repeat(301),
            })
        ).toThrow(/300 znaków/);
    });

    it('przyjmuje listę zadań startowych', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            taskTemplates: [
                { name: 'Sprawdzić gwarancję', description: 'opis', status: 'Backlog' },
                { name: 'Zebrać dane', description: '', status: '' },
            ],
        });
        expect(result.taskTemplates).toEqual([
            { name: 'Sprawdzić gwarancję', description: 'opis', status: 'Backlog' },
            { name: 'Zebrać dane', description: '', status: '' },
        ]);
    });

    // Ta sama pułapka co przy liście rodziców: Tools.parseObjectsJSON woła
    // JSON.parse na każdym polu ciała żądania, więc jednoelementowa lista
    // potrafi dotrzeć bez otaczającej tablicy.
    it('przyjmuje pojedyncze zadanie dostarczone bez tablicy', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            taskTemplates: { name: 'Jedno zadanie', description: '', status: '' },
        });
        expect(result.taskTemplates).toHaveLength(1);
        expect(result.taskTemplates[0].name).toBe('Jedno zadanie');
    });

    it('przyjmuje czysto liczbową nazwę zadania', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            taskTemplates: [{ name: 7, description: '', status: '' }],
        });
        expect(result.taskTemplates[0].name).toBe('7');
    });

    it('odrzuca zadanie bez nazwy', () => {
        expect(() =>
            TypesTreeValidator.validateNewCaseType({
                ...baseCaseType,
                taskTemplates: [{ name: '   ', description: 'opis', status: '' }],
            })
        ).toThrow(/Nazwa zadania/);
    });

    it('pilnuje limitów kolumn TaskTemplates (150 / 300 / 20)', () => {
        const withTask = (task: any) => () =>
            TypesTreeValidator.validateNewCaseType({ ...baseCaseType, taskTemplates: [task] });

        expect(withTask({ name: 'x'.repeat(151) })).toThrow(/150 znaków/);
        expect(withTask({ name: 'ok', description: 'x'.repeat(301) })).toThrow(/300 znaków/);
        expect(withTask({ name: 'ok', status: 'x'.repeat(21) })).toThrow(/20 znaków/);
    });

    it('pomija pozycje, które nie są obiektem - to puste wiersze formularza', () => {
        const result = TypesTreeValidator.validateNewCaseType({
            ...baseCaseType,
            taskTemplates: [null, { name: 'Zostaje', description: '', status: '' }, 'śmieć'],
        });
        expect(result.taskTemplates).toHaveLength(1);
        expect(result.taskTemplates[0].name).toBe('Zostaje');
    });
});

describe('TypesTreeValidator - szablon kamienia', () => {
    const baseMilestone = { name: 'Nowy kamień', contractTypeId: 1, folderNumber: '09' };

    it('pilnuje limitów kolumn MilestoneTemplates (150 / 300)', () => {
        expect(() =>
            TypesTreeValidator.validateNewMilestoneType({
                ...baseMilestone,
                templateName: 'x'.repeat(151),
            })
        ).toThrow(/150 znaków/);
        expect(() =>
            TypesTreeValidator.validateNewMilestoneType({
                ...baseMilestone,
                templateDescription: 'x'.repeat(301),
            })
        ).toThrow(/300 znaków/);
    });

    it('bez danych szablonu zwraca puste wartości', () => {
        const result = TypesTreeValidator.validateNewMilestoneType(baseMilestone);
        expect(result.templateName).toBe('');
        expect(result.templateDescription).toBe('');
    });
});

describe('TypesTreeValidator - edycja typu sprawy', () => {
    const current = { name: 'Odcinek', milestoneTypeId: 6 };

    // Tabela CaseType_SubCaseTypes nie ma ograniczenia CHECK, więc wiersz (X, X)
    // wszedłby do bazy bez protestu i dałby zapętlenie przy zakładaniu spraw.
    it('nie pozwala uczynić typu podsprawą samego siebie', () => {
        expect(() =>
            TypesTreeValidator.validateEditCaseType(
                {
                    id: 113,
                    name: 'Odcinek',
                    folderNumber: '04.03',
                    isSubCaseOnly: true,
                    parentCaseTypeIds: [8, 113],
                },
                current
            )
        ).toThrow(/podsprawą samego siebie/);
    });

    it('przepuszcza poprawną listę rodziców', () => {
        const result = TypesTreeValidator.validateEditCaseType(
            {
                id: 113,
                name: 'Odcinek',
                folderNumber: '04.03',
                isSubCaseOnly: true,
                parentCaseTypeIds: [8, 10],
            },
            current
        );
        expect(result.parentCaseTypeIds).toEqual([8, 10]);
        expect(result.id).toBe(113);
    });

    it('bierze kamień z bazy, ignorując przysłany w żądaniu', () => {
        const result: any = TypesTreeValidator.validateEditCaseType(
            {
                id: 113,
                name: 'Odcinek',
                folderNumber: '04.03',
                milestoneTypeId: 999,
                isSubCaseOnly: false,
            },
            current
        );
        expect(result.milestoneTypeId).toBeUndefined();
    });
});

describe('TypesTreeValidator - typ kamienia', () => {
    const baseMilestone = {
        name: 'Nowy kamień',
        contractTypeId: 1,
        folderNumber: '09',
    };

    it('przyjmuje numer folderu dostarczony jako liczba', () => {
        // to samo źródło problemu co przy liście rodziców: "9" -> 9
        const result = TypesTreeValidator.validateNewMilestoneType({
            ...baseMilestone,
            folderNumber: 9,
        });
        expect(result.folderNumber).toBe('9');
    });

    it('pilnuje limitu dwóch znaków numeru folderu', () => {
        expect(() =>
            TypesTreeValidator.validateNewMilestoneType({
                ...baseMilestone,
                folderNumber: '123',
            })
        ).toThrow(/2 znak/);
    });
});
