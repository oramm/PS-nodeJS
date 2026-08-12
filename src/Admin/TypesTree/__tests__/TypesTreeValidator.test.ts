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
