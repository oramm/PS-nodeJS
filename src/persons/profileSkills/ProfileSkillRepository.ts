import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import PersonProfileSkill from './PersonProfileSkill';
import { PersonProfileSkillV2Payload, PersonProfileSkillV2Record } from '../../types/types';

export default class ProfileSkillRepository extends BaseRepository<PersonProfileSkill> {
    constructor() {
        super('PersonProfileSkills');
    }

    protected mapRowToModel(row: any): PersonProfileSkill {
        return new PersonProfileSkill({
            id: row.Id,
            personProfileId: row.PersonProfileId,
            skillId: row.SkillId,
            levelCode: row.LevelCode ?? undefined,
            yearsOfExperience: row.YearsOfExperience != null
                ? Number(row.YearsOfExperience)
                : undefined,
            sortOrder: row.SortOrder ?? undefined,
            _skill: row.SkillName
                ? {
                      id: row.SkillId,
                      name: row.SkillName,
                      nameNormalized: row.SkillNameNormalized,
                  }
                : undefined,
        });
    }

    async find(personId: number): Promise<PersonProfileSkill[]> {
        const sql = mysql.format(
            `SELECT
                pps.Id,
                pps.PersonProfileId,
                pps.SkillId,
                pps.LevelCode,
                pps.YearsOfExperience,
                pps.SortOrder,
                sd.Name AS SkillName,
                sd.NameNormalized AS SkillNameNormalized
             FROM PersonProfileSkills pps
             JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
             JOIN SkillsDictionary sd ON sd.Id = pps.SkillId
             WHERE pp.PersonId = ?
             ORDER BY pps.SortOrder ASC, pps.Id ASC`,
            [personId],
        );
        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    async addSkillInDb(
        personId: number,
        skill: PersonProfileSkillV2Payload,
        conn: mysql.PoolConnection,
    ): Promise<PersonProfileSkillV2Record> {
        const personProfileId = await this.ensurePersonProfileId(conn, personId);
        const columns = ['PersonProfileId', 'SkillId'];
        const placeholders = ['?', '?'];
        const values: any[] = [personProfileId, skill.skillId];

        if (skill.levelCode !== undefined) {
            columns.push('LevelCode');
            placeholders.push('?');
            values.push(skill.levelCode ?? null);
        }
        if (skill.yearsOfExperience !== undefined) {
            columns.push('YearsOfExperience');
            placeholders.push('?');
            values.push(skill.yearsOfExperience ?? null);
        }
        if (skill.sortOrder !== undefined) {
            columns.push('SortOrder');
            placeholders.push('?');
            values.push(skill.sortOrder);
        }

        const [result]: any = await conn.execute(
            `INSERT INTO PersonProfileSkills (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            values,
        );
        const insertedId = Number(result?.insertId);
        const created = await this.getByIdInConn(conn, personId, insertedId);
        if (!created) {
            throw new Error(
                `Failed to create profile skill for PersonId=${personId}`,
            );
        }
        return created;
    }

    async editSkillInDb(
        personId: number,
        skillEntryId: number,
        skill: PersonProfileSkillV2Payload,
        conn: mysql.PoolConnection,
    ): Promise<PersonProfileSkillV2Record> {
        const existing = await this.getByIdInConn(conn, personId, skillEntryId);
        if (!existing) {
            throw new Error(
                `Profile skill Id=${skillEntryId} not found for PersonId=${personId}`,
            );
        }

        const setParts: string[] = [];
        const values: any[] = [];
        if (skill.levelCode !== undefined) {
            setParts.push('LevelCode = ?');
            values.push(skill.levelCode ?? null);
        }
        if (skill.yearsOfExperience !== undefined) {
            setParts.push('YearsOfExperience = ?');
            values.push(skill.yearsOfExperience ?? null);
        }
        if (skill.sortOrder !== undefined) {
            setParts.push('SortOrder = ?');
            values.push(skill.sortOrder);
        }

        if (setParts.length > 0) {
            values.push(skillEntryId);
            await conn.execute(
                `UPDATE PersonProfileSkills SET ${setParts.join(', ')} WHERE Id = ?`,
                values,
            );
        }

        const updated = await this.getByIdInConn(conn, personId, skillEntryId);
        if (!updated) {
            throw new Error(
                `Failed to update profile skill Id=${skillEntryId} for PersonId=${personId}`,
            );
        }
        return updated;
    }

    async deleteSkillFromDb(
        personId: number,
        skillEntryId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        const [result]: any = await conn.execute(
            `DELETE pps
             FROM PersonProfileSkills pps
             JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
             WHERE pp.PersonId = ? AND pps.Id = ?`,
            [personId, skillEntryId],
        );
        if (!result?.affectedRows) {
            throw new Error(
                `Profile skill Id=${skillEntryId} not found for PersonId=${personId}`,
            );
        }
    }

    private mapRowToRecord(row: any): PersonProfileSkillV2Record {
        return {
            id: row.Id,
            personProfileId: row.PersonProfileId,
            skillId: row.SkillId,
            levelCode: row.LevelCode ?? undefined,
            yearsOfExperience: row.YearsOfExperience != null
                ? Number(row.YearsOfExperience)
                : undefined,
            sortOrder: row.SortOrder ?? undefined,
            _skill: row.SkillName
                ? {
                      id: row.SkillId,
                      name: row.SkillName,
                      nameNormalized: row.SkillNameNormalized,
                  }
                : undefined,
        };
    }

    private async getByIdInConn(
        conn: mysql.PoolConnection,
        personId: number,
        skillEntryId: number,
    ): Promise<PersonProfileSkillV2Record | undefined> {
        const [rows] = await conn.query<any[]>(
            `SELECT
                pps.Id,
                pps.PersonProfileId,
                pps.SkillId,
                pps.LevelCode,
                pps.YearsOfExperience,
                pps.SortOrder,
                sd.Name AS SkillName,
                sd.NameNormalized AS SkillNameNormalized
             FROM PersonProfileSkills pps
             JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
             JOIN SkillsDictionary sd ON sd.Id = pps.SkillId
             WHERE pp.PersonId = ? AND pps.Id = ?
             LIMIT 1`,
            [personId, skillEntryId],
        );
        const row = rows[0];
        if (!row) return undefined;
        return this.mapRowToRecord(row);
    }

    private async ensurePersonProfileId(
        conn: mysql.PoolConnection,
        personId: number,
    ): Promise<number> {
        const [rows] = await conn.query<any[]>(
            'SELECT Id FROM PersonProfiles WHERE PersonId = ? LIMIT 1',
            [personId],
        );
        if (rows.length > 0) return rows[0].Id;

        const [result]: any = await conn.execute(
            'INSERT INTO PersonProfiles (PersonId) VALUES (?)',
            [personId],
        );
        return Number(result.insertId);
    }
}
