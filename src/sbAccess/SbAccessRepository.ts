import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { SbAccessRecord, SbAccessStateInput } from './sbAccessTypes';

const STATE_COLUMNS = `s.Id AS id, s.PersonId AS personId, s.StatusCode AS statusCode,
    s.GithubLogin AS githubLogin, s.GithubInvitationId AS githubInvitationId,
    s.DrivePermissionId AS drivePermissionId, s.IsGrantedManually AS isGrantedManually,
    s.CreatedAt AS createdAt, s.UpdatedAt AS updatedAt`;

function mapState(row: SbAccessRecord): SbAccessRecord {
    return { ...row, isGrantedManually: !!row.isGrantedManually };
}

export default class SbAccessRepository {
    async getByPersonId(
        personId: number,
        conn?: mysql.PoolConnection,
    ): Promise<SbAccessRecord | null> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${STATE_COLUMNS} FROM SbAccess s WHERE s.PersonId = ?`,
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

    async list(): Promise<SbAccessRecord[]> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${STATE_COLUMNS}, p.Name AS name, p.Surname AS surname,
                pa.SystemEmail AS systemEmail
             FROM SbAccess s
             JOIN Persons p ON p.Id = s.PersonId
             LEFT JOIN PersonAccounts pa ON pa.PersonId = s.PersonId
             ORDER BY p.Surname, p.Name, s.PersonId`,
        )) as SbAccessRecord[];
        return rows.map(mapState);
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
