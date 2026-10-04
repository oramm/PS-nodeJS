import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

export type ChatSpaceRecord = {
    id: number;
    googleName: string;
    displayName: string;
    uri: string | null;
    projectOurId: string | null;
    createdAt: Date | string | null;
    createdByPersonId: number | null;
};

/** Dane umowy potrzebne do decyzji o pokoju. `isOur` = umowa ma wiersz w OurContractsData. */
export type ContractChatInfo = {
    id: number;
    name: string;
    alias: string | null;
    projectOurId: string;
    projectAlias: string | null;
    projectName: string;
    chatSpaceId: number | null;
    isOur: boolean;
    ourId: string | null;
    managerId: number | null;
    adminId: number | null;
};

export type PersonEmailRow = { personId: number; email: string | null };

/**
 * Tylko SQL, bez reguł biznesowych (te siedzą w ChatSpacesController).
 * Transakcją zarządza kontroler, repozytorium dostaje gotowe połączenie.
 */
export default class ChatSpaceRepository {
    private static mapRow(row: any): ChatSpaceRecord {
        return {
            id: row.Id,
            googleName: row.GoogleName,
            displayName: row.DisplayName,
            uri: row.Uri ?? null,
            projectOurId: row.ProjectOurId ?? null,
            createdAt: row.CreatedAt ?? null,
            createdByPersonId: row.CreatedByPersonId ?? null,
        };
    }

    async getContractInfo(
        contractId: number,
        conn?: mysql.PoolConnection
    ): Promise<ContractChatInfo | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            mysql.format(
                `SELECT Contracts.Id, Contracts.Name, Contracts.Alias,
                        Contracts.ProjectOurId, Contracts.ChatSpaceId,
                        Projects.Alias AS ProjectAlias, Projects.Name AS ProjectName,
                        OurContractsData.OurId, OurContractsData.ManagerId,
                        OurContractsData.AdminId
                 FROM Contracts
                 JOIN Projects ON Projects.OurId = Contracts.ProjectOurId
                 LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
                 WHERE Contracts.Id = ?`,
                [contractId]
            ),
            conn
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return {
            id: row.Id,
            name: row.Name ?? '',
            alias: row.Alias ?? null,
            projectOurId: row.ProjectOurId,
            projectAlias: row.ProjectAlias ?? null,
            projectName: row.ProjectName ?? '',
            chatSpaceId: row.ChatSpaceId ?? null,
            isOur: row.OurId != null,
            ourId: row.OurId ?? null,
            managerId: row.ManagerId ?? null,
            adminId: row.AdminId ?? null,
        };
    }

    /** E-mail Google osoby: wylacznie PersonAccounts.SystemEmail aktywnego konta (ROD-5; Persons.SystemEmail i Persons.Email nie sa czytane). */
    async getGoogleEmails(personIds: number[]): Promise<PersonEmailRow[]> {
        if (!personIds.length) return [];
        const rows = (await ToolsDb.getQueryCallbackAsync(
            mysql.format(
                `SELECT PersonAccounts.PersonId AS Id,
                        NULLIF(TRIM(PersonAccounts.SystemEmail), '') AS Email
                 FROM PersonAccounts
                 WHERE PersonAccounts.PersonId IN (?)
                   AND PersonAccounts.IsActive = 1`,
                [personIds]
            )
        )) as any[];
        return rows.map((r) => ({ personId: r.Id, email: r.Email ?? null }));
    }

    async findSpaceById(
        id: number,
        conn?: mysql.PoolConnection
    ): Promise<ChatSpaceRecord | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            mysql.format(`SELECT * FROM ChatSpaces WHERE Id = ?`, [id]),
            conn
        )) as any[];
        return rows[0] ? ChatSpaceRepository.mapRow(rows[0]) : undefined;
    }

    /** Pokoje z bazy: najpierw te zwiazane z podanym projektem, potem reszta (od najnowszych). */
    async listSpaces(projectOurId?: string): Promise<ChatSpaceRecord[]> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            mysql.format(
                `SELECT * FROM ChatSpaces
                 ORDER BY (ProjectOurId <=> ?) DESC, DisplayName ASC, Id ASC`,
                [projectOurId ?? null]
            )
        )) as any[];
        return rows.map(ChatSpaceRepository.mapRow);
    }

    async addSpace(
        space: {
            googleName: string;
            displayName: string;
            uri: string | null;
            projectOurId: string | null;
            createdByPersonId: number | null;
        },
        conn: mysql.PoolConnection
    ): Promise<number> {
        const result = await ToolsDb.executeSQL(
            `INSERT INTO ChatSpaces
                (GoogleName, DisplayName, Uri, ProjectOurId, CreatedByPersonId)
             VALUES (?, ?, ?, ?, ?)`,
            [
                space.googleName,
                space.displayName,
                space.uri,
                space.projectOurId,
                space.createdByPersonId,
            ],
            conn
        );
        return result.insertId;
    }

    /**
     * Ustawia pokoj umowy. `onlyIfEmpty` czyni zapis warunkowym (ochrona przed
     * dwoma rownoleglymi "utworz"). Zwraca liczbe zmienionych wierszy.
     */
    async setContractSpace(
        contractId: number,
        chatSpaceId: number | null,
        conn: mysql.PoolConnection,
        onlyIfEmpty = false
    ): Promise<number> {
        const result = await ToolsDb.executeSQL(
            `UPDATE Contracts SET ChatSpaceId = ?
             WHERE Id = ?${onlyIfEmpty ? ' AND ChatSpaceId IS NULL' : ''}`,
            [chatSpaceId, contractId],
            conn
        );
        return result.affectedRows;
    }
}
