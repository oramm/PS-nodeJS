import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import SbAccessValidator from './SbAccessValidator';
import { parsePublicKeyJwk } from './sbSecretsPolicy';
import { healthReportFromDb, summarizeHealth } from './sbHealthPolicy';
import {
    SbAccessLevels,
    SbPublicKeyJwk,
    SbHealthReport,
    SbAccessRecord,
    SbAccessStateInput,
    SbPersonAccount,
} from './sbAccessTypes';

const STATE_COLUMNS = `s.Id AS id, s.PersonId AS personId, s.StatusCode AS statusCode,
    s.GithubLogin AS githubLogin, s.GithubInvitationId AS githubInvitationId,
    s.DrivePermissionId AS drivePermissionId, s.IsGrantedManually AS isGrantedManually,
    s.Levels AS levels, s.PublicKeyJwk AS publicKeyJwk, s.PublicKeySetAt AS publicKeySetAt,
    s.CreatedAt AS createdAt, s.UpdatedAt AS updatedAt`;

/** Klucz z bazy: tekst JSON albo obiekt; uszkodzony = brak klucza (hasła nie da się wtedy udostępnić). */
function publicKeyFromDb(raw: unknown): SbPublicKeyJwk | null {
    if (raw == null) return null;
    try {
        return parsePublicKeyJwk(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
        return null;
    }
}

function mapState(row: SbAccessRecord): SbAccessRecord {
    return {
        ...row,
        isGrantedManually: !!row.isGrantedManually,
        ...(row.canManageSb !== undefined && { canManageSb: !!row.canManageSb }),
        levels: SbAccessValidator.levelsFromDb(row.levels),
        publicKeyJwk: publicKeyFromDb(row.publicKeyJwk),
        publicKeySetAt: row.publicKeySetAt ?? null,
    };
}

/**
 * Stany, w których token urządzenia przestaje istnieć (odebranie albo blokada dostępu SB).
 * W tych samych stanach kontroler kasuje szyfrogramy haseł osoby (ta sama transakcja).
 */
export const TOKEN_CLEARING_STATUSES: readonly string[] = ['BLOCKED', 'REVOKED'];

export default class SbAccessRepository {
    /** `lock` = SELECT ... FOR UPDATE (tylko w transakcji; szereguje zmianę klucza i udostępnienie hasła). */
    async getByPersonId(
        personId: number,
        conn?: mysql.PoolConnection,
        lock = false,
    ): Promise<SbAccessRecord | null> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${STATE_COLUMNS} FROM SbAccess s WHERE s.PersonId = ?${lock ? ' FOR UPDATE' : ''}`,
            conn,
            [personId],
        )) as SbAccessRecord[];
        return rows.length ? mapState(rows[0]) : null;
    }

    async getByGithubLogin(
        login: string,
        conn?: mysql.PoolConnection,
    ): Promise<SbAccessRecord | null> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${STATE_COLUMNS} FROM SbAccess s WHERE s.GithubLogin = ?`,
            conn,
            [login],
        )) as SbAccessRecord[];
        return rows.length ? mapState(rows[0]) : null;
    }

    /** Zapis poziomów istniejącego wpisu; false, gdy osoba nie ma wpisu. */
    async setLevels(
        conn: mysql.PoolConnection,
        personId: number,
        levels: SbAccessLevels,
    ): Promise<boolean> {
        if (!conn)
            throw new Error('Zapis poziomów SB wymaga połączenia transakcji');
        const rows = (await ToolsDb.getQueryCallbackAsync(
            'SELECT Id FROM SbAccess WHERE PersonId = ? FOR UPDATE',
            conn,
            [personId],
        )) as { Id: number }[];
        if (!rows.length) return false;
        await ToolsDb.executeSQL(
            'UPDATE SbAccess SET Levels = ? WHERE PersonId = ?',
            [JSON.stringify(levels), personId],
            conn,
        );
        return true;
    }

    /** Wpis po skrócie tokenu urządzenia (instalator bez sesji). */
    async getByDeviceTokenHash(hash: string): Promise<SbAccessRecord | null> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${STATE_COLUMNS} FROM SbAccess s WHERE s.DeviceTokenHash = ?`,
            undefined,
            [hash],
        )) as SbAccessRecord[];
        return rows.length === 1 ? mapState(rows[0]) : null;
    }

    /**
     * Nowy token urządzenia (poprzedni przestaje działać). Zapis przez query, nie executeSQL:
     * executeSQL wypisuje parametry do logu.
     */
    async setDeviceTokenHash(
        conn: mysql.PoolConnection,
        personId: number,
        hash: string,
    ): Promise<boolean> {
        if (!conn) throw new Error('Zapis tokenu SB wymaga połączenia transakcji');
        const result = (await ToolsDb.getQueryCallbackAsync(
            'UPDATE SbAccess SET DeviceTokenHash = ?, DeviceTokenIssuedAt = NOW() WHERE PersonId = ?',
            conn,
            [hash, personId],
        )) as { affectedRows: number };
        return result.affectedRows === 1;
    }

    async setPublicKey(
        conn: mysql.PoolConnection,
        personId: number,
        jwk: SbPublicKeyJwk,
    ): Promise<void> {
        if (!conn) throw new Error('Zapis klucza SB wymaga połączenia transakcji');
        await ToolsDb.getQueryCallbackAsync(
            'UPDATE SbAccess SET PublicKeyJwk = ?, PublicKeySetAt = NOW() WHERE PersonId = ?',
            conn,
            [JSON.stringify(jwk), personId],
        );
    }

    async list(now: Date = new Date()): Promise<SbAccessRecord[]> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${STATE_COLUMNS}, p.Name AS name, p.Surname AS surname,
                pa.SystemEmail AS systemEmail,
                EXISTS (SELECT 1 FROM StaffMembers sm WHERE sm.PersonId = s.PersonId
                    AND sm.CanManageSbAccess = 1 AND sm.IsActive = 1) AS canManageSb,
                s.HealthReport AS healthReport, s.HealthReportedAt AS healthReportedAt,
                s.HealthRefreshRequestedAt AS healthRefreshRequestedAt
             FROM SbAccess s
             JOIN Persons p ON p.Id = s.PersonId
             LEFT JOIN PersonAccounts pa ON pa.PersonId = s.PersonId
             ORDER BY p.Surname, p.Name, s.PersonId`,
        )) as (SbAccessRecord & {
            healthReport?: unknown;
            healthReportedAt?: Date | null;
            healthRefreshRequestedAt?: Date | null;
        })[];
        return rows.map(({ healthReport, healthReportedAt, healthRefreshRequestedAt, ...row }) => {
            const report = healthReportedAt ? healthReportFromDb(healthReport) : null;
            return {
                ...mapState(row),
                health: report
                    ? summarizeHealth(report, healthReportedAt!, healthRefreshRequestedAt ?? null, now)
                    : null,
            };
        });
    }

    /**
     * Ostatni raport instalatora (SBD-4a): nadpisuje poprzedni (bez historii raportów), czas
     * ustawia serwer, a zapis czyści prośbę admina o świeży raport. Zapis przez query, nie
     * executeSQL (ten wypisuje parametry do logu).
     */
    async saveHealthReport(personId: number, report: SbHealthReport): Promise<void> {
        await ToolsDb.getQueryCallbackAsync(
            `UPDATE SbAccess SET HealthReport = ?, HealthReportedAt = NOW(), HealthRefreshRequestedAt = NULL
             WHERE PersonId = ?`,
            undefined,
            [JSON.stringify(report), personId],
        );
    }

    /** Raport do pobrania przez admina: raport, czas przyjęcia i prośba; null = osoba bez wpisu. */
    async getHealth(personId: number): Promise<{
        report: SbHealthReport | null;
        reportedAt: Date | null;
        refreshRequestedAt: Date | null;
    } | null> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT HealthReport AS healthReport, HealthReportedAt AS reportedAt,
                HealthRefreshRequestedAt AS refreshRequestedAt
             FROM SbAccess WHERE PersonId = ?`,
            undefined,
            [personId],
        )) as { healthReport: unknown; reportedAt: Date | null; refreshRequestedAt: Date | null }[];
        if (!rows.length) return null;
        const { healthReport, reportedAt, refreshRequestedAt } = rows[0];
        return {
            report: reportedAt ? healthReportFromDb(healthReport) : null,
            reportedAt: reportedAt ?? null,
            refreshRequestedAt: refreshRequestedAt ?? null,
        };
    }

    /**
     * Ustawia prośbę o świeży raport. Zwraca, czy prośba już czekała (wtedy wołający nie
     * dopisuje kolejnego zdarzenia). Wiersz blokowany do końca transakcji.
     */
    async requestHealthRefresh(conn: mysql.PoolConnection, personId: number): Promise<boolean> {
        if (!conn) throw new Error('Zapis prośby o raport SB wymaga połączenia transakcji');
        const rows = (await ToolsDb.getQueryCallbackAsync(
            'SELECT HealthRefreshRequestedAt AS requestedAt FROM SbAccess WHERE PersonId = ? FOR UPDATE',
            conn,
            [personId],
        )) as { requestedAt: Date | null }[];
        const alreadyPending = !!rows[0]?.requestedAt;
        if (!alreadyPending)
            await ToolsDb.getQueryCallbackAsync(
                'UPDATE SbAccess SET HealthRefreshRequestedAt = NOW() WHERE PersonId = ?',
                conn,
                [personId],
            );
        return alreadyPending;
    }

    async isHealthRefreshRequested(personId: number): Promise<boolean> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            'SELECT HealthRefreshRequestedAt AS requestedAt FROM SbAccess WHERE PersonId = ?',
            undefined,
            [personId],
        )) as { requestedAt: Date | null }[];
        return !!rows[0]?.requestedAt;
    }

    /**
     * Konto osoby, której dotyczy operacja: adres logowania, rola, czy aktywne.
     * Adres zaproszenia bierze się wyłącznie stąd, nigdy z żądania HTTP.
     */
    async getPersonAccount(personId: number): Promise<SbPersonAccount | null> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT p.Id AS personId, p.Name AS name, p.Surname AS surname,
                pa.SystemEmail AS systemEmail, pa.IsActive AS isActive,
                sr.Name AS systemRoleName
             FROM Persons p
             LEFT JOIN PersonAccounts pa ON pa.PersonId = p.Id
             LEFT JOIN SystemRoles sr ON sr.Id = pa.SystemRoleId
             WHERE p.Id = ?
             LIMIT 1`,
            undefined,
            [personId],
        )) as SbPersonAccount[];
        if (!rows.length) return null;
        return { ...rows[0], isActive: !!rows[0].isActive };
    }

    /** Osoby z aktywnym kontem w podanych rolach, bez wpisu albo z dostępem odebranym. */
    async listInviteCandidates(roles: string[]): Promise<SbPersonAccount[]> {
        if (!roles.length) return [];
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT p.Id AS personId, p.Name AS name, p.Surname AS surname,
                pa.SystemEmail AS systemEmail, pa.IsActive AS isActive,
                sr.Name AS systemRoleName, s.StatusCode AS statusCode
             FROM Persons p
             JOIN PersonAccounts pa ON pa.PersonId = p.Id AND pa.IsActive = 1
             JOIN SystemRoles sr ON sr.Id = pa.SystemRoleId
             LEFT JOIN SbAccess s ON s.PersonId = p.Id
             WHERE sr.Name IN (${roles.map(() => '?').join(', ')})
               AND pa.SystemEmail IS NOT NULL AND pa.SystemEmail <> ''
               AND (s.Id IS NULL OR s.StatusCode = 'REVOKED')
             ORDER BY p.Surname, p.Name, p.Id`,
            undefined,
            roles,
        )) as SbPersonAccount[];
        return rows.map((row) => ({ ...row, isActive: !!row.isActive }));
    }

    /**
     * Zapis stanu osoby: SELECT ... FOR UPDATE, potem UPDATE albo INSERT po PersonId.
     * Celowo NIE `INSERT ... ON DUPLICATE KEY UPDATE`: przy zajetym GithubLogin (UNIQUE)
     * nadpisalby wiersz INNEJ osoby. Tu konflikt loginu konczy sie zwyklym bledem
     * ER_DUP_ENTRY, a cudzy stan zostaje nietkniety. undefined = nie ruszaj pola,
     * null = wyczysc pole.
     */
    async upsertState(
        conn: mysql.PoolConnection,
        input: SbAccessStateInput & { personId: number },
    ): Promise<void> {
        if (!conn)
            throw new Error('Zapis stanu SB wymaga połączenia transakcji');
        const fields: [string, unknown][] = [['StatusCode', input.statusCode]];
        const optionalFields = [
            ['githubLogin', 'GithubLogin'],
            ['githubInvitationId', 'GithubInvitationId'],
            ['drivePermissionId', 'DrivePermissionId'],
            ['isGrantedManually', 'IsGrantedManually'],
        ] as const;
        for (const [field, column] of optionalFields) {
            const value = input[field];
            if (value === undefined) continue;
            fields.push([column, typeof value === 'boolean' ? +value : value]);
        }
        // Blokada i odebranie unieważniają token instalatora; po odblokowaniu pracownik pobiera paczkę ponownie.
        if (TOKEN_CLEARING_STATUSES.includes(input.statusCode))
            fields.push(['DeviceTokenHash', null], ['DeviceTokenIssuedAt', null]);

        const existing = (await ToolsDb.getQueryCallbackAsync(
            'SELECT Id FROM SbAccess WHERE PersonId = ? FOR UPDATE',
            conn,
            [input.personId],
        )) as { Id: number }[];

        if (existing.length) {
            await ToolsDb.executeSQL(
                `UPDATE SbAccess SET ${fields
                    .map(([column]) => `${column} = ?`)
                    .join(', ')} WHERE PersonId = ?`,
                [...fields.map(([, value]) => value), input.personId],
                conn,
            );
            return;
        }
        await ToolsDb.executeSQL(
            `INSERT INTO SbAccess (PersonId, ${fields
                .map(([column]) => column)
                .join(', ')})
             VALUES (?, ${fields.map(() => '?').join(', ')})`,
            [input.personId, ...fields.map(([, value]) => value)],
            conn,
        );
    }
}
