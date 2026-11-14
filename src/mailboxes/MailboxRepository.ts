import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import { MailboxAssigneeRow } from './mailboxAccessPolicy';

/** Skrzynka poczty ze spisu PS (plan MBX); bez haseł. */
export interface MailboxRecord {
    id?: number;
    code: string;
    address: string;
    projectId: number | null;
    contractId: number | null;
    createdByPersonId?: number | null;
    statusCode: string;
    lastError?: string | null;
    agentCopyStatus: 'PENDING' | 'SET';
    agentCopyLastError: string | null;
}

const COLUMNS = `Id AS id, Code AS code, Address AS address, ProjectId AS projectId,
    ContractId AS contractId, CreatedByPersonId AS createdByPersonId, StatusCode AS statusCode, LastError AS lastError,
    AgentCopyStatus AS agentCopyStatus, AgentCopyLastError AS agentCopyLastError`;

export default class MailboxRepository {
    /**
     * Skrzynki z kierownikiem, administratorem i wybranymi osobami kontraktów, do których należą
     * (skrzynka projektu: wszystkie kontrakty projektu; ogólnofirmowa: jeden wiersz z null-ami).
     * Kto z tego ma dostęp, rozstrzyga `personMailboxes` - tu tylko SQL.
     */
    async findWithAssignees(includePending = false): Promise<MailboxAssigneeRow[]> {
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT DISTINCT m.Code AS code, m.Address AS address, o.ManagerId AS managerId, o.AdminId AS adminId,
                sp.PersonId AS selectedPersonId
            FROM Mailboxes m
            LEFT JOIN Contracts c ON c.Id = m.ContractId
                OR (m.ProjectId IS NOT NULL AND c.ProjectOurId = (SELECT OurId FROM Projects WHERE Id = m.ProjectId))
            LEFT JOIN OurContractsData o ON o.Id = c.Id
            LEFT JOIN ContractSelectedPersons sp ON sp.ContractId = c.Id
            WHERE m.StatusCode IN (${includePending ? "'ACTIVE', 'PENDING'" : "'ACTIVE'"})`,
        )) as MailboxAssigneeRow[];
    }

    async find(): Promise<MailboxRecord[]> {
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${COLUMNS}
            FROM Mailboxes ORDER BY Code`,
        )) as MailboxRecord[];
    }

    async get(id: number, conn?: mysql.PoolConnection, lock = false): Promise<MailboxRecord | undefined> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `SELECT ${COLUMNS} FROM Mailboxes WHERE Id = ?${lock ? ' FOR UPDATE' : ''}`, conn, [id],
        ) as MailboxRecord[];
        return rows[0];
    }

    async forOwner(projectId: number | null, contractId: number | null): Promise<MailboxRecord | undefined> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `SELECT ${COLUMNS} FROM Mailboxes WHERE ${contractId ? 'ContractId' : 'ProjectId'} = ?`,
            undefined, [contractId ?? projectId],
        ) as MailboxRecord[];
        return rows[0];
    }

    async addressExists(address: string, code: string): Promise<boolean> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            'SELECT Id FROM Mailboxes WHERE Address = ? OR Code = ?', undefined, [address, code],
        ) as any[];
        return rows.length > 0;
    }

    async reserve(address: string, code: string, projectId: number | null, contractId: number | null, createdByPersonId: number | null): Promise<MailboxRecord> {
        const result = await ToolsDb.executeSQL(
            `INSERT INTO Mailboxes (Code, Address, ProjectId, ContractId, CreatedByPersonId, StatusCode)
             VALUES (?, ?, ?, ?, ?, 'PENDING')`, [code, address, projectId, contractId, createdByPersonId],
        );
        return { id: result.insertId, code, address, projectId, contractId, createdByPersonId, statusCode: 'PENDING', lastError: null,
            agentCopyStatus: 'PENDING', agentCopyLastError: null };
    }

    async setState(id: number, status: string, lastError: string | null, conn: mysql.PoolConnection): Promise<void> {
        await ToolsDb.executeSQL('UPDATE Mailboxes SET StatusCode = ?, LastError = ? WHERE Id = ?',
            [status, lastError, id], conn);
    }

    async setAgentCopyState(id: number, status: 'PENDING' | 'SET', lastError: string | null, conn: mysql.PoolConnection): Promise<void> {
        await ToolsDb.executeSQL('UPDATE Mailboxes SET AgentCopyStatus = ?, AgentCopyLastError = ? WHERE Id = ?',
            [status, lastError, id], conn);
    }

    async project(ourId: string): Promise<{ id: number; ourId: string } | undefined> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            'SELECT Id AS id, OurId AS ourId FROM Projects WHERE OurId = ?', undefined, [ourId],
        ) as any[];
        return rows[0];
    }

    async contract(id: number, conn?: mysql.PoolConnection): Promise<{ id: number; projectId: number; projectOurId: string; ourId: string } | undefined> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `SELECT c.Id AS id, p.Id AS projectId, p.OurId AS projectOurId, o.OurId AS ourId
             FROM Contracts c JOIN Projects p ON p.OurId = c.ProjectOurId
             LEFT JOIN OurContractsData o ON o.Id = c.Id WHERE c.Id = ?`, conn, [id],
        ) as any[];
        return rows[0];
    }

    async moveToProject(id: number, projectId: number, conn: mysql.PoolConnection): Promise<void> {
        await ToolsDb.executeSQL('UPDATE Mailboxes SET ContractId = NULL, ProjectId = ? WHERE Id = ?', [projectId, id], conn);
    }
}
