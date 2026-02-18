import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import {
    SkillDictionaryRecord,
    SkillDictionaryPayload,
} from '../../types/types';
import SkillDictionary from './SkillDictionary';

interface SkillsSearchParams {
    searchText?: string;
}

export default class SkillsDictionaryRepository extends BaseRepository<SkillDictionary> {
    constructor() {
        super('SkillsDictionary');
    }

    protected mapRowToModel(row: any): SkillDictionary {
        return new SkillDictionary({
            id: row.Id,
            name: row.Name,
            nameNormalized: row.NameNormalized,
            description: row.Description ?? null,
        });
    }

    static normalizeName(name: string): string {
        return name.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    private static normalizeDescription(
        description: string | null | undefined,
    ): string | null {
        if (description == null) {
            return null;
        }

        const trimmed = description.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    async find(searchParams?: SkillsSearchParams): Promise<SkillDictionary[]> {
        let sql =
            'SELECT Id, Name, NameNormalized, Description FROM SkillsDictionary';
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

    async findByNormalizedName(name: string): Promise<SkillDictionary | undefined> {
        const normalized = SkillsDictionaryRepository.normalizeName(name);
        const rows = await this.executeQuery(
            mysql.format(
                'SELECT Id, Name, NameNormalized, Description FROM SkillsDictionary WHERE NameNormalized = ? LIMIT 1',
                [normalized],
            ),
        );
        const row = rows[0];
        if (!row) return undefined;
        return this.mapRowToModel(row);
    }

    async addSkillInDb(
        payload: SkillDictionaryPayload,
        conn: mysql.PoolConnection,
    ): Promise<SkillDictionaryRecord> {
        const nameNormalized = SkillsDictionaryRepository.normalizeName(
            payload.name,
        );
        const description = SkillsDictionaryRepository.normalizeDescription(
            payload.description,
        );

        const [result]: any = await conn.execute(
            'INSERT INTO SkillsDictionary (Name, NameNormalized, Description) VALUES (?, ?, ?)',
            [payload.name.trim(), nameNormalized, description],
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

        const nameNormalized = SkillsDictionaryRepository.normalizeName(
            payload.name,
        );
        const description = SkillsDictionaryRepository.normalizeDescription(
            payload.description,
        );
        await conn.execute(
            'UPDATE SkillsDictionary SET Name = ?, NameNormalized = ?, Description = ? WHERE Id = ?',
            [payload.name.trim(), nameNormalized, description, skillId],
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
    ): Promise<SkillDictionary | undefined> {
        const [rows] = await conn.query<any[]>(
            'SELECT Id, Name, NameNormalized, Description FROM SkillsDictionary WHERE Id = ? LIMIT 1',
            [skillId],
        );
        const row = rows[0];
        if (!row) return undefined;
        return this.mapRowToModel(row);
    }
}
