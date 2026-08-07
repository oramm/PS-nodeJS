import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

/**
 * Repository dla drzewa struktury umowy (typy kamieni + typy spraw dostępne
 * dla danego typu umowy, wraz z opcjonalnymi szablonami).
 *
 * KLUCZOWE: obie kwerendy używają LEFT JOIN na tabelach szablonów. Typ bez
 * szablonu MUSI zostać w wyniku - to cała różnica względem dzisiejszej ścieżki
 * automatycznego tworzenia, gdzie JOIN działa jak cichy filtr i wycina 4 typy
 * kamieni oraz 29 typów spraw oznaczonych jako domyślne.
 *
 * Nie dziedziczy po BaseRepository: nie obsługuje jednej tabeli i nie ma
 * operacji CRUD - to wyłącznie zapytania odczytowe łączące słowniki.
 */

export type MilestoneTypeRow = {
    milestoneTypeId: number;
    typeName: string;
    folderNumber: string;
    isDefault: boolean;
    isUniquePerContract: boolean;
    templateId: number | null;
    templateName: string;
    templateDescription: string;
};

export type CaseTypeRow = {
    caseTypeId: number;
    milestoneTypeId: number;
    typeName: string;
    folderNumber: string;
    description: string;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    isSubCaseOnly: boolean;
    templateId: number | null;
    templateName: string;
    templateDescription: string;
};

export default class ContractTemplatesTreeRepository {
    /**
     * Typy kamieni przypisane do typu umowy, z opcjonalnym szablonem CONTRACT.
     */
    async findMilestoneTypes(
        contractTypeId: number
    ): Promise<MilestoneTypeRow[]> {
        const sql = `SELECT
                MilestoneTypes_ContractTypes.MilestoneTypeId,
                MilestoneTypes_ContractTypes.FolderNumber,
                MilestoneTypes_ContractTypes.IsDefault,
                MilestoneTypes.Name AS TypeName,
                MilestoneTypes.IsUniquePerContract,
                MilestoneTemplates.Id AS TemplateId,
                MilestoneTemplates.Name AS TemplateName,
                MilestoneTemplates.Description AS TemplateDescription
            FROM MilestoneTypes_ContractTypes
            JOIN MilestoneTypes
                ON MilestoneTypes.Id = MilestoneTypes_ContractTypes.MilestoneTypeId
            LEFT JOIN MilestoneTemplates
                ON MilestoneTemplates.MilestoneTypeId = MilestoneTypes.Id
                AND MilestoneTemplates.TemplateType = 'CONTRACT'
            WHERE ${mysql.format(
                'MilestoneTypes_ContractTypes.ContractTypeId = ?',
                [contractTypeId]
            )}
            -- Jeden wiersz na typ. Dziś żaden typ nie ma dwóch szablonów
            -- CONTRACT, ale bez tego drugi dałby zdublowaną pozycję w drzewie.
            GROUP BY MilestoneTypes.Id
            ORDER BY MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes.Name`;

        const rows = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            milestoneTypeId: row.MilestoneTypeId,
            typeName: row.TypeName ?? '',
            folderNumber: row.FolderNumber ?? '',
            isDefault: !!row.IsDefault,
            isUniquePerContract: !!row.IsUniquePerContract,
            templateId: row.TemplateId ?? null,
            templateName: row.TemplateName ?? '',
            templateDescription: row.TemplateDescription ?? '',
        }));
    }

    /**
     * Typy spraw możliwe do utworzenia jako sprawy podanych kamieni, wraz
     * z opcjonalnym szablonem.
     *
     * Pomija IsSubCaseOnly - taki typ istnieje wyłącznie jako podsprawa, więc
     * nie może powstać jako sprawa kamienia. W bazie dwa takie typy mają
     * jednocześnie IsDefault=1, więc bez tego warunku trafiłyby do drzewa jako
     * wybieralne.
     */
    async findCaseTypes(milestoneTypeIds: number[]): Promise<CaseTypeRow[]> {
        if (!milestoneTypeIds.length) return [];

        const sql = `SELECT
                CaseTypes.Id,
                CaseTypes.MilestoneTypeId,
                CaseTypes.Name AS TypeName,
                CaseTypes.FolderNumber,
                CaseTypes.Description,
                CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone,
                CaseTypes.IsSubCaseOnly,
                CaseTemplates.Id AS TemplateId,
                CaseTemplates.Name AS TemplateName,
                CaseTemplates.Description AS TemplateDescription
            FROM CaseTypes
            LEFT JOIN CaseTemplates ON CaseTemplates.CaseTypeId = CaseTypes.Id
            WHERE ${mysql.format('CaseTypes.MilestoneTypeId IN (?)', [
                milestoneTypeIds,
            ])}
                AND CaseTypes.IsSubCaseOnly = FALSE
            -- Jeden wiersz na typ sprawy, patrz komentarz przy typach kamieni.
            GROUP BY CaseTypes.Id
            ORDER BY CaseTypes.FolderNumber, CaseTypes.Name`;

        const rows = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            caseTypeId: row.Id,
            milestoneTypeId: row.MilestoneTypeId,
            typeName: row.TypeName ?? '',
            folderNumber: row.FolderNumber ?? '',
            description: row.Description ?? '',
            isDefault: !!row.IsDefault,
            isUniquePerMilestone: !!row.IsUniquePerMilestone,
            isSubCaseOnly: !!row.IsSubCaseOnly,
            templateId: row.TemplateId ?? null,
            templateName: row.TemplateName ?? '',
            templateDescription: row.TemplateDescription ?? '',
        }));
    }
}
