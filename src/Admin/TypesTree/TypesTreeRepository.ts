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
                COUNT(Milestones.Id) AS UsageCount
            FROM MilestoneTypes
            LEFT JOIN Milestones ON Milestones.TypeId = MilestoneTypes.Id
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
                CaseTypes.IsSubCaseOnly, COUNT(Cases.Id) AS UsageCount
            FROM CaseTypes
            LEFT JOIN Cases ON Cases.TypeId = CaseTypes.Id
            GROUP BY CaseTypes.Id
            ORDER BY CaseTypes.FolderNumber, CaseTypes.Name`;
        const rows = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
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
        }));
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
