import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import {
    isCaseTypeNameLocked,
    isMilestoneTypeNameLocked,
} from './protectedTypes';

/**
 * Repository widoku hierarchii typów.
 *
 * NIE dziedziczy po BaseRepository - ta klasa nie obsługuje jednej tabeli i nie
 * ma operacji CRUD (precedens: ContractTemplatesTreeRepository). BaseRepository
 * wymusza mapRowToModel<T> i find() dla JEDNEJ encji, a tu mamy sześć.
 *
 * Zapytania są celowo płaskie - żadnych JOIN-ów między poziomami. Powód
 * w TypesTreeController.
 */

export type TypesTreeContractType = {
    id: number;
    name: string;
    description: string;
    status: string;
    isOur: boolean;
};

export type TypesTreeMilestoneType = {
    id: number;
    name: string;
    description: string;
    isUniquePerContract: boolean;
    isInScrumByDefault: boolean;
    /** Ile realnych kamieni korzysta z typu - panel ostrzega przed zmianą nazwy. */
    _usageCount: number;
    /** Kod odwołuje się do tego typu po identyfikatorze; nazwa zablokowana. */
    _isNameLocked: boolean;
    /**
     * Szablon kamienia (MilestoneTemplates, TemplateType='CONTRACT').
     * Bez niego kamień NIE powstanie automatycznie, nawet przy IsDefault na krawędzi -
     * zapytanie tworzące strukturę umowy startuje od tabeli szablonów.
     * Szablon wisi na TYPIE, a flaga „domyślny” na krawędzi z typem umowy.
     */
    _templateId: number | null;
    _templateName: string;
    _templateDescription: string;
};

export type TypesTreeContractTypeMilestoneType = {
    contractTypeId: number | null;
    milestoneTypeId: number;
    folderNumber: string | null;
    isDefault: boolean;
};

export type TypesTreeOfferMilestoneType = {
    milestoneTypeId: number;
    folderNumber: string;
};

export type TypesTreeCaseType = {
    id: number;
    milestoneTypeId: number | null;
    name: string;
    description: string;
    folderNumber: string | null;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    isInScrumByDefault: boolean;
    isSubCaseOnly: boolean;
    /** Ile realnych spraw korzysta z typu. */
    _usageCount: number;
    /** Kod odwołuje się do tego typu po identyfikatorze albo po nazwie. */
    _isNameLocked: boolean;
    /**
     * Szablon sprawy (CaseTemplates). Bez niego sprawa NIE powstanie automatycznie,
     * nawet przy IsDefault - zapytanie tworzące strukturę startuje od szablonów.
     * Wiersz szablonu jest też KOTWICĄ dla szablonów zadań, więc nie kasujemy go
     * przy odznaczeniu „powstaje automatycznie”.
     */
    _templateId: number | null;
    _templateName: string;
    _templateDescription: string;
    /** Zadania zakładane razem ze sprawą. */
    _taskTemplates: TypesTreeTaskTemplate[];
};

export type TypesTreeTaskTemplate = {
    id: number;
    name: string;
    description: string;
    status: string;
};

export type TypesTreeSubCaseLink = {
    parentCaseTypeId: number;
    subCaseTypeId: number;
};

export default class TypesTreeRepository {
    async findContractTypes(): Promise<TypesTreeContractType[]> {
        const sql = `SELECT Id, Name, Description, Status, IsOur
            FROM ContractTypes ORDER BY Name`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            id: row.Id,
            name: row.Name,
            description: row.Description ?? '',
            status: row.Status,
            isOur: !!row.IsOur,
        }));
    }

    async findMilestoneTypes(): Promise<TypesTreeMilestoneType[]> {
        // Bez JOIN Contracts. Istniejące MilestoneTypeRepository.find() złącza się
        // z umowami, przez co ukrywa typy kamieni, dla których nie istnieje ani jedna
        // umowa - w panelu takiego typu nie dałoby się nigdy przypisać.
        const sql = `SELECT MilestoneTypes.Id, MilestoneTypes.Name, MilestoneTypes.Description,
                MilestoneTypes.IsUniquePerContract, MilestoneTypes.IsInScrumByDefault,
                COUNT(DISTINCT Milestones.Id) AS UsageCount,
                MilestoneTemplates.Id AS TemplateId,
                MilestoneTemplates.Name AS TemplateName,
                MilestoneTemplates.Description AS TemplateDescription
            FROM MilestoneTypes
            LEFT JOIN Milestones ON Milestones.TypeId = MilestoneTypes.Id
            LEFT JOIN MilestoneTemplates
                ON MilestoneTemplates.MilestoneTypeId = MilestoneTypes.Id
                AND MilestoneTemplates.TemplateType = 'CONTRACT'
            GROUP BY MilestoneTypes.Id
            ORDER BY MilestoneTypes.Name`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            id: row.Id,
            name: row.Name,
            description: row.Description ?? '',
            isUniquePerContract: !!row.IsUniquePerContract,
            isInScrumByDefault: !!row.IsInScrumByDefault,
            _usageCount: Number(row.UsageCount ?? 0),
            _isNameLocked: isMilestoneTypeNameLocked(row.Id),
            _templateId: row.TemplateId ?? null,
            _templateName: row.TemplateName ?? '',
            _templateDescription: row.TemplateDescription ?? '',
        }));
    }

    /** Krawędź M:N. FolderNumber i IsDefault należą do PARY, nie do typu kamienia. */
    async findContractTypeMilestoneTypes(): Promise<
        TypesTreeContractTypeMilestoneType[]
    > {
        const sql = `SELECT MilestoneTypeId, ContractTypeId, FolderNumber, IsDefault
            FROM MilestoneTypes_ContractTypes`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            contractTypeId: row.ContractTypeId ?? null,
            milestoneTypeId: row.MilestoneTypeId,
            folderNumber: row.FolderNumber ?? null,
            isDefault: !!row.IsDefault,
        }));
    }

    /** Równoległa gałąź dla ofert - inny zestaw kolumn, brak IsDefault. */
    async findOfferMilestoneTypes(): Promise<TypesTreeOfferMilestoneType[]> {
        const sql = `SELECT MilestoneTypeId, FolderNumber FROM MilestoneTypes_Offers`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            milestoneTypeId: row.MilestoneTypeId,
            folderNumber: row.FolderNumber,
        }));
    }

    async findCaseTypes(): Promise<TypesTreeCaseType[]> {
        // Bez filtra IsSubCaseOnly - w panelu podsprawy MUSZĄ być widoczne,
        // inaczej nie da się nimi zarządzać.
        const sql = `SELECT CaseTypes.Id, CaseTypes.MilestoneTypeId, CaseTypes.Name,
                CaseTypes.Description, CaseTypes.FolderNumber, CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone, CaseTypes.IsInScrumByDefault,
                CaseTypes.IsSubCaseOnly, COUNT(DISTINCT Cases.Id) AS UsageCount,
                CaseTemplates.Id AS TemplateId,
                CaseTemplates.Name AS TemplateName,
                CaseTemplates.Description AS TemplateDescription
            FROM CaseTypes
            LEFT JOIN Cases ON Cases.TypeId = CaseTypes.Id
            LEFT JOIN CaseTemplates ON CaseTemplates.CaseTypeId = CaseTypes.Id
            GROUP BY CaseTypes.Id
            ORDER BY CaseTypes.FolderNumber, CaseTypes.Name`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);

        const tasksByTemplate = await this.findTaskTemplatesByCaseTemplate();

        return rows.map((row) => ({
            id: row.Id,
            milestoneTypeId: row.MilestoneTypeId ?? null,
            name: row.Name,
            description: row.Description ?? '',
            folderNumber: row.FolderNumber ?? null,
            isDefault: !!row.IsDefault,
            isUniquePerMilestone: !!row.IsUniquePerMilestone,
            isInScrumByDefault: !!row.IsInScrumByDefault,
            isSubCaseOnly: !!row.IsSubCaseOnly,
            _usageCount: Number(row.UsageCount ?? 0),
            _isNameLocked: isCaseTypeNameLocked(row.Id, row.Name),
            _templateId: row.TemplateId ?? null,
            _templateName: row.TemplateName ?? '',
            _templateDescription: row.TemplateDescription ?? '',
            _taskTemplates: row.TemplateId
                ? tasksByTemplate.get(row.TemplateId) ?? []
                : [],
        }));
    }

    /** Zadania startowe pogrupowane po szablonie sprawy - jedno zapytanie, bez N+1. */
    private async findTaskTemplatesByCaseTemplate(): Promise<
        Map<number, TypesTreeTaskTemplate[]>
    > {
        const sql = `SELECT Id, Name, Description, Status, CaseTemplateId
            FROM TaskTemplates
            WHERE CaseTemplateId IS NOT NULL
            ORDER BY Id`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);

        const byTemplate = new Map<number, TypesTreeTaskTemplate[]>();
        for (const row of rows) {
            const list = byTemplate.get(row.CaseTemplateId) ?? [];
            list.push({
                id: row.Id,
                name: row.Name,
                description: row.Description ?? '',
                status: row.Status ?? '',
            });
            byTemplate.set(row.CaseTemplateId, list);
        }
        return byTemplate;
    }

    async findSubCaseTypeLinks(): Promise<TypesTreeSubCaseLink[]> {
        const sql = `SELECT ParentCaseTypeId, SubCaseTypeId FROM CaseType_SubCaseTypes`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => ({
            parentCaseTypeId: row.ParentCaseTypeId,
            subCaseTypeId: row.SubCaseTypeId,
        }));
    }

    /**
     * Tworzy powiązanie typu kamienia z typem umowy.
     *
     * Dedykowany zapis, bo tabela MilestoneTypes_ContractTypes nie ma klucza
     * głównego - generyczne metody BaseRepository operują po `Id` i tu nie zadziałają.
     * Numer folderu i „domyślny” należą właśnie do tego wiersza, a nie do typu kamienia.
     */
    /**
     * Zakłada szablon sprawy albo aktualizuje istniejący. Zwraca jego numer.
     *
     * Szablon jest warunkiem powstania sprawy przy nowej umowie ORAZ kotwicą dla
     * szablonów zadań, dlatego nigdy go tu nie kasujemy - odznaczenie „powstaje
     * automatycznie” zeruje tylko CaseTypes.IsDefault.
     */
    async upsertCaseTemplateInDb(
        params: {
            templateId: number | null;
            caseTypeId: number;
            name: string;
            description: string;
        },
        externalConn?: mysql.PoolConnection
    ): Promise<number> {
        if (params.templateId) {
            await ToolsDb.executeSQL(
                'UPDATE CaseTemplates SET Name = ?, Description = ? WHERE Id = ?',
                [params.name, params.description, params.templateId],
                externalConn
            );
            return params.templateId;
        }
        const result = await ToolsDb.executeSQL(
            'INSERT INTO CaseTemplates (Name, Description, CaseTypeId) VALUES (?, ?, ?)',
            [params.name, params.description, params.caseTypeId],
            externalConn
        );
        return result.insertId;
    }

    /**
     * Zakłada szablon kamienia albo aktualizuje istniejący.
     *
     * StartDateRule i EndDateRule są NOT NULL, a ich język nie jest w kodzie
     * zaimplementowany - przy zakładaniu wpisujemy więc wartości używane przez
     * wszystkie istniejące wiersze, zamiast wystawiać martwe pole w formularzu.
     */
    async upsertMilestoneTemplateInDb(
        params: {
            templateId: number | null;
            milestoneTypeId: number;
            name: string;
            description: string;
        },
        externalConn?: mysql.PoolConnection
    ): Promise<number> {
        if (params.templateId) {
            await ToolsDb.executeSQL(
                'UPDATE MilestoneTemplates SET Name = ?, Description = ? WHERE Id = ?',
                [params.name, params.description, params.templateId],
                externalConn
            );
            return params.templateId;
        }
        const result = await ToolsDb.executeSQL(
            `INSERT INTO MilestoneTemplates
                (Name, Description, StartDateRule, EndDateRule, MilestoneTypeId, TemplateType)
             VALUES (?, ?, 'CONTRACT_START', 'CONTRACT_END', ?, 'CONTRACT')`,
            [params.name, params.description, params.milestoneTypeId],
            externalConn
        );
        return result.insertId;
    }

    /**
     * Podmienia komplet zadań startowych danego szablonu sprawy.
     *
     * DeadlineRule jest NOT NULL, a jego język nie działa - wstawiamy pusty ciąg,
     * tak jak większość istniejących wierszy.
     */
    async replaceTaskTemplatesInDb(
        caseTemplateId: number,
        tasks: { name: string; description: string; status: string }[],
        externalConn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            'DELETE FROM TaskTemplates WHERE CaseTemplateId = ?',
            [caseTemplateId],
            externalConn
        );
        for (const task of tasks) {
            await ToolsDb.executeSQL(
                `INSERT INTO TaskTemplates
                    (Name, Description, CaseTemplateId, Status, DeadlineRule)
                 VALUES (?, ?, ?, ?, '')`,
                [task.name, task.description, caseTemplateId, task.status || null],
                externalConn
            );
        }
    }

    /**
     * Ustawia komplet rodziców, pod którymi dany typ może wystąpić jako podsprawa.
     *
     * Podmiana całości, nie dokładanie: formularz przysyła docelowy stan, a nie różnicę.
     * Tabela ma klucz główny (ParentCaseTypeId, SubCaseTypeId), więc kasujemy po
     * stronie podsprawy i wstawiamy na nowo.
     */
    async replaceSubCaseTypeLinksInDb(
        subCaseTypeId: number,
        parentCaseTypeIds: number[],
        externalConn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            'DELETE FROM CaseType_SubCaseTypes WHERE SubCaseTypeId = ?',
            [subCaseTypeId],
            externalConn
        );
        for (const parentCaseTypeId of parentCaseTypeIds) {
            await ToolsDb.executeSQL(
                'INSERT INTO CaseType_SubCaseTypes (ParentCaseTypeId, SubCaseTypeId) VALUES (?, ?)',
                [parentCaseTypeId, subCaseTypeId],
                externalConn
            );
        }
    }

    /**
     * Zmienia numer folderu i oznaczenie „domyślny” na POWIĄZANIU kamienia z typem
     * umowy. Te dwa pola nie należą do typu kamienia - ten sam kamień ma inny numer
     * w różnych typach umów, więc aktualizujemy konkretną krawędź.
     */
    async updateContractTypeMilestoneTypeInDb(
        params: {
            milestoneTypeId: number;
            contractTypeId: number;
            folderNumber: string;
            isDefault: boolean;
        },
        externalConn?: mysql.PoolConnection
    ): Promise<any> {
        const sql = `UPDATE MilestoneTypes_ContractTypes
            SET FolderNumber = ?, IsDefault = ?
            WHERE MilestoneTypeId = ? AND ContractTypeId = ?`;
        return await ToolsDb.executeSQL(
            sql,
            [
                params.folderNumber,
                params.isDefault ? 1 : 0,
                params.milestoneTypeId,
                params.contractTypeId,
            ],
            externalConn
        );
    }

    async addContractTypeMilestoneTypeInDb(
        params: {
            milestoneTypeId: number;
            contractTypeId: number;
            folderNumber: string;
            isDefault: boolean;
        },
        externalConn?: mysql.PoolConnection
    ): Promise<any> {
        const sql = `INSERT INTO MilestoneTypes_ContractTypes
                (MilestoneTypeId, ContractTypeId, FolderNumber, IsDefault)
            VALUES (?, ?, ?, ?)`;
        return await ToolsDb.executeSQL(
            sql,
            [
                params.milestoneTypeId,
                params.contractTypeId,
                params.folderNumber,
                params.isDefault ? 1 : 0,
            ],
            externalConn
        );
    }
}
