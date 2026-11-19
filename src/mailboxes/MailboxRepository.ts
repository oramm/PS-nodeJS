import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import { MailboxAssigneeRow, mailboxAssigneeRows, MailboxOwnerRow } from './mailboxAccessPolicy';
import ProjectAssignmentRepository from '../persons/projectAssignments/ProjectAssignmentRepository';
import SbAccessValidator from '../sbAccess/SbAccessValidator';

export type AgentCopyStatus = 'PENDING' | 'SET' | 'NONE';

/** Posiadacz hasła zarządzanego z faktami do reguły dostępu (bez haseł). */
export interface MailboxHolderRow {
    mailboxId: number;
    personId: number;
    version: number;
    statusCode: string | null;
    isActive: boolean;
    systemRoleName: string | null;
    manualCodes: string[];
}

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
    agentCopyStatus: AgentCopyStatus;
    agentCopyLastError: string | null;
    /** null albo brak = PS nie zna hasła tej skrzynki (SKO-2). */
    passwordVersion?: number | null;
    allEmployees?: boolean;
}

const COLUMNS = `Id AS id, Code AS code, Address AS address, ProjectId AS projectId,
    ContractId AS contractId, CreatedByPersonId AS createdByPersonId, StatusCode AS statusCode, LastError AS lastError,
    AgentCopyStatus AS agentCopyStatus, AgentCopyLastError AS agentCopyLastError,
    PasswordVersion AS passwordVersion, AllEmployees AS allEmployees`;

const record = (row: any): MailboxRecord => ({ ...row, allEmployees: !!row.allEmployees });

export default class MailboxRepository {
    /**
     * Skrzynki z osobami przypisanymi według reguły projectMembership (mailboxAssigneeRows).
     * Kto z tego ma dostęp, rozstrzyga `personMailboxes` - tu tylko odczyt.
     */
    async findWithAssignees(includePending = false): Promise<MailboxAssigneeRow[]> {
        const [mailboxes, edges] = await Promise.all([
            this.findOwners(includePending),
            ProjectAssignmentRepository.findMembership(),
        ]);
        return mailboxAssigneeRows(mailboxes, edges);
    }

    /** Skrzynki z właścicielem (projekt albo kontrakt) - wejście reguły mailboxAssigneeRows. */
    async findOwners(includePending = false): Promise<MailboxOwnerRow[]> {
        return ((await ToolsDb.getQueryCallbackAsync(
            `SELECT m.Code AS code, m.Address AS address, m.ContractId AS contractId,
                COALESCE(c.ProjectOurId, p.OurId) AS projectOurId, m.AllEmployees AS allEmployees,
                m.PasswordVersion AS passwordVersion
            FROM Mailboxes m
            LEFT JOIN Contracts c ON c.Id = m.ContractId
            LEFT JOIN Projects p ON p.Id = m.ProjectId
            WHERE m.StatusCode IN (${includePending ? "'ACTIVE', 'PENDING'" : "'ACTIVE'"})`,
        )) as any[]).map((row): MailboxOwnerRow => ({ ...row, allEmployees: !!row.allEmployees }));
    }

    async find(): Promise<MailboxRecord[]> {
        return ((await ToolsDb.getQueryCallbackAsync(
            `SELECT ${COLUMNS}
            FROM Mailboxes ORDER BY Code`,
        )) as any[]).map(record);
    }

    async get(id: number, conn?: mysql.PoolConnection, lock = false): Promise<MailboxRecord | undefined> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `SELECT ${COLUMNS} FROM Mailboxes WHERE Id = ?${lock ? ' FOR UPDATE' : ''}`, conn, [id],
        ) as any[];
        return rows[0] && record(rows[0]);
    }

    async forOwner(projectId: number | null, contractId: number | null): Promise<MailboxRecord | undefined> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `SELECT ${COLUMNS} FROM Mailboxes WHERE ${contractId ? 'ContractId' : 'ProjectId'} = ?`,
            undefined, [contractId ?? projectId],
        ) as any[];
        return rows[0] && record(rows[0]);
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
            agentCopyStatus: 'PENDING', agentCopyLastError: null, passwordVersion: null, allEmployees: false };
    }

    /** Istniejąca skrzynka ogólnofirmowa dopisana do spisu: od razu ACTIVE, bez kopii, hasła PS nie zna. */
    async addGeneral(address: string, code: string, createdByPersonId: number | null): Promise<MailboxRecord> {
        const result = await ToolsDb.executeSQL(
            `INSERT INTO Mailboxes (Code, Address, CreatedByPersonId, StatusCode, AgentCopyStatus)
             VALUES (?, ?, ?, 'ACTIVE', 'NONE')`, [code, address, createdByPersonId],
        );
        return { id: result.insertId, code, address, projectId: null, contractId: null, createdByPersonId, statusCode: 'ACTIVE', lastError: null,
            agentCopyStatus: 'NONE', agentCopyLastError: null, passwordVersion: null, allEmployees: false };
    }

    async setAllEmployees(id: number, allEmployees: boolean): Promise<void> {
        await ToolsDb.executeSQL('UPDATE Mailboxes SET AllEmployees = ? WHERE Id = ?', [allEmployees ? 1 : 0, id]);
    }

    /** Nowa wersja hasła; posiadacze starszych wersji przestają być posiadaczami. */
    async setPasswordVersion(id: number, version: number, conn: mysql.PoolConnection): Promise<void> {
        await ToolsDb.executeSQL('UPDATE Mailboxes SET PasswordVersion = ? WHERE Id = ?', [version, id], conn);
        await ToolsDb.executeSQL('DELETE FROM MailboxPasswordHolders WHERE MailboxId = ? AND Version < ?', [id, version], conn);
    }

    async setHolder(conn: mysql.PoolConnection, mailboxId: number, personId: number, version: number): Promise<void> {
        await ToolsDb.executeSQL(
            `INSERT INTO MailboxPasswordHolders (MailboxId, PersonId, Version) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE Version = VALUES(Version)`, [mailboxId, personId, version], conn);
    }

    async holderVersions(personId: number): Promise<Map<number, number>> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            'SELECT MailboxId AS mailboxId, Version AS version FROM MailboxPasswordHolders WHERE PersonId = ?', undefined, [personId],
        ) as { mailboxId: number; version: number }[];
        return new Map(rows.map(row => [row.mailboxId, row.version]));
    }

    /** Wszyscy posiadacze z tym, co rozstrzyga ich dostęp dziś: wpis SB, konto PS, rola, wyjątki ręczne. */
    async holders(): Promise<MailboxHolderRow[]> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `SELECT h.MailboxId AS mailboxId, h.PersonId AS personId, h.Version AS version,
                s.StatusCode AS statusCode, s.Levels AS levels, pa.IsActive AS isActive, sr.Name AS systemRoleName
            FROM MailboxPasswordHolders h
            LEFT JOIN SbAccess s ON s.PersonId = h.PersonId
            LEFT JOIN PersonAccounts pa ON pa.PersonId = h.PersonId
            LEFT JOIN SystemRoles sr ON sr.Id = pa.SystemRoleId`,
        ) as any[];
        return rows.map(({ levels, isActive, ...row }) => ({
            ...row, isActive: !!isActive, manualCodes: SbAccessValidator.levelsFromDb(levels).mail,
        }));
    }

    async setState(id: number, status: string, lastError: string | null, conn: mysql.PoolConnection): Promise<void> {
        await ToolsDb.executeSQL('UPDATE Mailboxes SET StatusCode = ?, LastError = ? WHERE Id = ?',
            [status, lastError, id], conn);
    }

    async setAgentCopyState(id: number, status: AgentCopyStatus, lastError: string | null, conn: mysql.PoolConnection): Promise<void> {
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
