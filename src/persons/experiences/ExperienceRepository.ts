import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import PersonProfileExperience from './PersonProfileExperience';
import {
    PersonProfileExperienceV2Payload,
    PersonProfileExperienceV2Record,
} from '../../types/types';

export interface ExperienceSearchParams {
    searchText?: string;
    organizationName?: string;
    positionName?: string;
    isCurrent?: boolean;
    dateFrom?: string;
    dateTo?: string;
}

export default class ExperienceRepository extends BaseRepository<PersonProfileExperience> {
    constructor() {
        super('PersonProfileExperiences');
    }

    protected mapRowToModel(row: any): PersonProfileExperience {
        return new PersonProfileExperience({
            id: row.Id,
            personProfileId: row.PersonProfileId,
            organizationName: row.OrganizationName ?? undefined,
            positionName: row.PositionName ?? undefined,
            description: row.Description ?? undefined,
            dateFrom: row.DateFrom ?? undefined,
            dateTo: row.DateTo ?? undefined,
            isCurrent: row.IsCurrent != null ? Boolean(row.IsCurrent) : undefined,
            sortOrder: row.SortOrder ?? undefined,
        });
    }

    async find(
        personId: number,
        orConditions: ExperienceSearchParams[] = [],
    ): Promise<PersonProfileExperience[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditionsExperience.bind(this),
                  )
                : '1';

        const sql = mysql.format(
            `SELECT
                ppe.Id,
                ppe.PersonProfileId,
                ppe.OrganizationName,
                ppe.PositionName,
                ppe.Description,
                ppe.DateFrom,
                ppe.DateTo,
                ppe.IsCurrent,
                ppe.SortOrder
             FROM PersonProfileExperiences ppe
             JOIN PersonProfiles pp ON pp.Id = ppe.PersonProfileId
             WHERE pp.PersonId = ? AND ${conditions}
             ORDER BY ppe.SortOrder ASC, ppe.Id ASC`,
            [personId],
        );
        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditionsExperience(
        searchParams: ExperienceSearchParams,
    ): string {
        const conditions: string[] = [];

        if (searchParams.organizationName) {
            conditions.push(
                `ppe.OrganizationName LIKE ${mysql.escape(`%${searchParams.organizationName}%`)}`,
            );
        }
        if (searchParams.positionName) {
            conditions.push(
                `ppe.PositionName LIKE ${mysql.escape(`%${searchParams.positionName}%`)}`,
            );
        }
        if (searchParams.isCurrent !== undefined) {
            conditions.push(
                `ppe.IsCurrent = ${mysql.escape(searchParams.isCurrent ? 1 : 0)}`,
            );
        }
        if (searchParams.dateFrom) {
            conditions.push(
                `ppe.DateFrom >= ${mysql.escape(searchParams.dateFrom)}`,
            );
        }
        if (searchParams.dateTo) {
            conditions.push(
                `ppe.DateTo <= ${mysql.escape(searchParams.dateTo)}`,
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText,
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(ppe.OrganizationName LIKE ${mysql.escape(`%${word}%`)}
                OR ppe.PositionName LIKE ${mysql.escape(`%${word}%`)}
                OR ppe.Description LIKE ${mysql.escape(`%${word}%`)})`,
        );

        return conditions.join(' AND ');
    }

    async addExperienceInDb(
        personId: number,
        experience: PersonProfileExperienceV2Payload,
        conn: mysql.PoolConnection,
    ): Promise<PersonProfileExperienceV2Record> {
        const personProfileId = await this.ensurePersonProfileId(
            conn,
            personId,
        );
        const columns = ['PersonProfileId'];
        const placeholders = ['?'];
        const values: any[] = [personProfileId];

        if (experience.organizationName !== undefined) {
            columns.push('OrganizationName');
            placeholders.push('?');
            values.push(experience.organizationName ?? null);
        }
        if (experience.positionName !== undefined) {
            columns.push('PositionName');
            placeholders.push('?');
            values.push(experience.positionName ?? null);
        }
        if (experience.description !== undefined) {
            columns.push('Description');
            placeholders.push('?');
            values.push(experience.description ?? null);
        }
        if (experience.dateFrom !== undefined) {
            columns.push('DateFrom');
            placeholders.push('?');
            values.push(experience.dateFrom ?? null);
        }
        if (experience.dateTo !== undefined) {
            columns.push('DateTo');
            placeholders.push('?');
            values.push(experience.dateTo ?? null);
        }
        if (experience.isCurrent !== undefined) {
            columns.push('IsCurrent');
            placeholders.push('?');
            values.push(experience.isCurrent ? 1 : 0);
        }
        if (experience.sortOrder !== undefined) {
            columns.push('SortOrder');
            placeholders.push('?');
            values.push(experience.sortOrder);
        }

        const [result]: any = await conn.execute(
            `INSERT INTO PersonProfileExperiences (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            values,
        );
        const insertedId = Number(result?.insertId);
        const created = await this.getByIdInConn(conn, personId, insertedId);
        if (!created) {
            throw new Error(
                `Failed to create experience for PersonId=${personId}`,
            );
        }
        return created;
    }

    async editExperienceInDb(
        personId: number,
        experienceId: number,
        experience: PersonProfileExperienceV2Payload,
        conn: mysql.PoolConnection,
    ): Promise<PersonProfileExperienceV2Record> {
        const existing = await this.getByIdInConn(conn, personId, experienceId);
        if (!existing) {
            throw new Error(
                `Experience Id=${experienceId} not found for PersonId=${personId}`,
            );
        }

        const setParts: string[] = [];
        const values: any[] = [];
        if (experience.organizationName !== undefined) {
            setParts.push('OrganizationName = ?');
            values.push(experience.organizationName ?? null);
        }
        if (experience.positionName !== undefined) {
            setParts.push('PositionName = ?');
            values.push(experience.positionName ?? null);
        }
        if (experience.description !== undefined) {
            setParts.push('Description = ?');
            values.push(experience.description ?? null);
        }
        if (experience.dateFrom !== undefined) {
            setParts.push('DateFrom = ?');
            values.push(experience.dateFrom ?? null);
        }
        if (experience.dateTo !== undefined) {
            setParts.push('DateTo = ?');
            values.push(experience.dateTo ?? null);
        }
        if (experience.isCurrent !== undefined) {
            setParts.push('IsCurrent = ?');
            values.push(experience.isCurrent ? 1 : 0);
        }
        if (experience.sortOrder !== undefined) {
            setParts.push('SortOrder = ?');
            values.push(experience.sortOrder);
        }

        if (setParts.length > 0) {
            values.push(experienceId);
            await conn.execute(
                `UPDATE PersonProfileExperiences SET ${setParts.join(', ')} WHERE Id = ?`,
                values,
            );
        }

        const updated = await this.getByIdInConn(conn, personId, experienceId);
        if (!updated) {
            throw new Error(
                `Failed to update experience Id=${experienceId} for PersonId=${personId}`,
            );
        }
        return updated;
    }

    async deleteExperienceFromDb(
        personId: number,
        experienceId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        const [result]: any = await conn.execute(
            `DELETE ppe
             FROM PersonProfileExperiences ppe
             JOIN PersonProfiles pp ON pp.Id = ppe.PersonProfileId
             WHERE pp.PersonId = ? AND ppe.Id = ?`,
            [personId, experienceId],
        );
        if (!result?.affectedRows) {
            throw new Error(
                `Experience Id=${experienceId} not found for PersonId=${personId}`,
            );
        }
    }

    private mapRowToRecord(row: any): PersonProfileExperienceV2Record {
        return {
            id: row.Id,
            personProfileId: row.PersonProfileId,
            organizationName: row.OrganizationName ?? undefined,
            positionName: row.PositionName ?? undefined,
            description: row.Description ?? undefined,
            dateFrom: row.DateFrom ?? undefined,
            dateTo: row.DateTo ?? undefined,
            isCurrent: row.IsCurrent != null ? Boolean(row.IsCurrent) : undefined,
            sortOrder: row.SortOrder ?? undefined,
        };
    }

    private async getByIdInConn(
        conn: mysql.PoolConnection,
        personId: number,
        experienceId: number,
    ): Promise<PersonProfileExperienceV2Record | undefined> {
        const [rows] = await conn.query<any[]>(
            `SELECT
                ppe.Id,
                ppe.PersonProfileId,
                ppe.OrganizationName,
                ppe.PositionName,
                ppe.Description,
                ppe.DateFrom,
                ppe.DateTo,
                ppe.IsCurrent,
                ppe.SortOrder
             FROM PersonProfileExperiences ppe
             JOIN PersonProfiles pp ON pp.Id = ppe.PersonProfileId
             WHERE pp.PersonId = ? AND ppe.Id = ?
             LIMIT 1`,
            [personId, experienceId],
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
