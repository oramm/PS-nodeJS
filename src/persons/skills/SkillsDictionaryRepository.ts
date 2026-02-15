import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import { SkillDictionaryRecord, SkillDictionaryPayload } from '../../types/types';

interface SkillsSearchParams {
    searchText?: string;
}

export default class SkillsDictionaryRepository extends BaseRepository<SkillDictionaryRecord> {
    constructor() {
        super('SkillsDictionary');
    }

    protected mapRowToModel(row: any): SkillDictionaryRecord {
        return {
            id: row.Id,
            name: row.Name,
            nameNormalized: row.NameNormalized,
        };
    }

    static normalizeName(name: string): string {
        return name.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    async find(searchParams?: SkillsSearchParams): Promise<SkillDictionaryRecord[]> {
        let sql = 'SELECT Id, Name, NameNormalized FROM SkillsDictionary';
        const conditions: string[] = [];

        if (searchParams?.searchText) {
            const escaped = mysql.escape(`%${searchParams.searchText}%`);
            conditions.push(`Name LIKE ${escaped}`);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY Name ASC';

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    async addSkillInDb(
        payload: SkillDictionaryPayload,
        conn: mysql.PoolConnection,
    ): Promise<SkillDictionaryRecord> {
        const nameNormalized = SkillsDictionaryRepository.normalizeName(payload.name);

        const [result]: any = await conn.execute(
            'INSERT INTO SkillsDictionary (Name, NameNormalized) VALUES (?, ?)',
            [payload.name.trim(), nameNormalized],
        );
        const insertedId = Number(result?.insertId);
        const created = await this.getByIdInConn(conn, insertedId);
        if (!created) {
            throw new Error('Failed to create skill');
        }
        return created;
    }

    async editSkillInDb(
        skillId: number,
        payload: SkillDictionaryPayload,
        conn: mysql.PoolConnection,
    ): Promise<SkillDictionaryRecord> {
        const existing = await this.getByIdInConn(conn, skillId);
        if (!existing) {
            throw new Error(`Skill Id=${skillId} not found`);
        }

        const nameNormalized = SkillsDictionaryRepository.normalizeName(payload.name);
        await conn.execute(
            'UPDATE SkillsDictionary SET Name = ?, NameNormalized = ? WHERE Id = ?',
            [payload.name.trim(), nameNormalized, skillId],
        );

        const updated = await this.getByIdInConn(conn, skillId);
        if (!updated) {
            throw new Error(`Failed to update skill Id=${skillId}`);
        }
        return updated;
    }

    async deleteSkillFromDb(
        skillId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        const [result]: any = await conn.execute(
            'DELETE FROM SkillsDictionary WHERE Id = ?',
            [skillId],
        );
        if (!result?.affectedRows) {
            throw new Error(`Skill Id=${skillId} not found`);
        }
    }

    private async getByIdInConn(
        conn: mysql.PoolConnection,
        skillId: number,
    ): Promise<SkillDictionaryRecord | undefined> {
        const [rows] = await conn.query<any[]>(
            'SELECT Id, Name, NameNormalized FROM SkillsDictionary WHERE Id = ? LIMIT 1',
            [skillId],
        );
        const row = rows[0];
        if (!row) return undefined;
        return this.mapRowToModel(row);
    }
}
