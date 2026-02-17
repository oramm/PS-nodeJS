import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import PersonProfileEducation from './PersonProfileEducation';
import {
    PersonProfileEducationV2Payload,
    PersonProfileEducationV2Record,
} from '../../types/types';

export interface EducationSearchParams {
    searchText?: string;
    schoolName?: string;
    degreeName?: string;
    fieldOfStudy?: string;
    dateFromAfter?: string;
    dateFromBefore?: string;
    dateToAfter?: string;
    dateToBefore?: string;
}

export default class EducationRepository extends BaseRepository<PersonProfileEducation> {
    constructor() {
        super('PersonProfileEducations');
    }

    protected mapRowToModel(row: any): PersonProfileEducation {
        return new PersonProfileEducation({
            id: row.Id,
            personProfileId: row.PersonProfileId,
            schoolName: row.SchoolName ?? undefined,
            degreeName: row.DegreeName ?? undefined,
            fieldOfStudy: row.FieldOfStudy ?? undefined,
            dateFrom: row.DateFrom ?? undefined,
            dateTo: row.DateTo ?? undefined,
            sortOrder: row.SortOrder ?? undefined,
        });
    }

    async find(
        personId: number,
        orConditions: EducationSearchParams[] = [],
    ): Promise<PersonProfileEducation[]> {
        const conditions =
            orConditions.length > 0
                ? ToolsDb.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this),
                  )
                : '1';

        const sql = mysql.format(
            `SELECT
                ppe.Id,
                ppe.PersonProfileId,
                ppe.SchoolName,
                ppe.DegreeName,
                ppe.FieldOfStudy,
                ppe.DateFrom,
                ppe.DateTo,
                ppe.SortOrder
             FROM PersonProfileEducations ppe
             JOIN PersonProfiles pp ON pp.Id = ppe.PersonProfileId
             WHERE pp.PersonId = ? AND (${conditions})
             ORDER BY ppe.SortOrder ASC, ppe.Id ASC`,
            [personId],
        );
        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: EducationSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.schoolName) {
            conditions.push(
                mysql.format(`ppe.SchoolName = ?`, [searchParams.schoolName]),
            );
        }
        if (searchParams.degreeName) {
            conditions.push(
                mysql.format(`ppe.DegreeName = ?`, [searchParams.degreeName]),
            );
        }
        if (searchParams.fieldOfStudy) {
            conditions.push(
                mysql.format(`ppe.FieldOfStudy = ?`, [
                    searchParams.fieldOfStudy,
                ]),
            );
        }
        if (searchParams.dateFromAfter) {
            conditions.push(
                mysql.format(`ppe.DateFrom >= ?`, [
                    searchParams.dateFromAfter,
                ]),
            );
        }
        if (searchParams.dateFromBefore) {
            conditions.push(
                mysql.format(`ppe.DateFrom <= ?`, [
                    searchParams.dateFromBefore,
                ]),
            );
        }
        if (searchParams.dateToAfter) {
            conditions.push(
                mysql.format(`ppe.DateTo >= ?`, [searchParams.dateToAfter]),
            );
        }
        if (searchParams.dateToBefore) {
            conditions.push(
                mysql.format(`ppe.DateTo <= ?`, [searchParams.dateToBefore]),
            );
        }
        if (searchParams.searchText) {
            const escaped = mysql.escape(`%${searchParams.searchText}%`);
            conditions.push(
                `(ppe.SchoolName LIKE ${escaped} OR ppe.DegreeName LIKE ${escaped} OR ppe.FieldOfStudy LIKE ${escaped})`,
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    async addEducationInDb(
        personId: number,
        education: PersonProfileEducationV2Payload,
        conn: mysql.PoolConnection,
    ): Promise<PersonProfileEducationV2Record> {
        const personProfileId = await this.ensurePersonProfileId(
            conn,
            personId,
        );
        const columns = ['PersonProfileId'];
        const placeholders = ['?'];
        const values: any[] = [personProfileId];

        if (education.schoolName !== undefined) {
            columns.push('SchoolName');
            placeholders.push('?');
            values.push(education.schoolName ?? null);
        }
        if (education.degreeName !== undefined) {
            columns.push('DegreeName');
            placeholders.push('?');
            values.push(education.degreeName ?? null);
        }
        if (education.fieldOfStudy !== undefined) {
            columns.push('FieldOfStudy');
            placeholders.push('?');
            values.push(education.fieldOfStudy ?? null);
        }
        if (education.dateFrom !== undefined) {
            columns.push('DateFrom');
            placeholders.push('?');
            values.push(education.dateFrom ?? null);
        }
        if (education.dateTo !== undefined) {
            columns.push('DateTo');
            placeholders.push('?');
            values.push(education.dateTo ?? null);
        }
        if (education.sortOrder !== undefined) {
            columns.push('SortOrder');
            placeholders.push('?');
            values.push(education.sortOrder);
        }

        const [result]: any = await conn.execute(
            `INSERT INTO PersonProfileEducations (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            values,
        );
        const insertedId = Number(result?.insertId);
        const created = await this.getByIdInConn(conn, personId, insertedId);
        if (!created) {
            throw new Error(
                `Failed to create education for PersonId=${personId}`,
            );
        }
        return created;
    }

    async editEducationInDb(
        personId: number,
        educationId: number,
        education: PersonProfileEducationV2Payload,
        conn: mysql.PoolConnection,
    ): Promise<PersonProfileEducationV2Record> {
        const existing = await this.getByIdInConn(conn, personId, educationId);
        if (!existing) {
            throw new Error(
                `Education Id=${educationId} not found for PersonId=${personId}`,
            );
        }

        const setParts: string[] = [];
        const values: any[] = [];
        if (education.schoolName !== undefined) {
            setParts.push('SchoolName = ?');
            values.push(education.schoolName ?? null);
        }
        if (education.degreeName !== undefined) {
            setParts.push('DegreeName = ?');
            values.push(education.degreeName ?? null);
        }
        if (education.fieldOfStudy !== undefined) {
            setParts.push('FieldOfStudy = ?');
            values.push(education.fieldOfStudy ?? null);
        }
        if (education.dateFrom !== undefined) {
            setParts.push('DateFrom = ?');
            values.push(education.dateFrom ?? null);
        }
        if (education.dateTo !== undefined) {
            setParts.push('DateTo = ?');
            values.push(education.dateTo ?? null);
        }
        if (education.sortOrder !== undefined) {
            setParts.push('SortOrder = ?');
            values.push(education.sortOrder);
        }

        if (setParts.length > 0) {
            values.push(educationId);
            await conn.execute(
                `UPDATE PersonProfileEducations SET ${setParts.join(', ')} WHERE Id = ?`,
                values,
            );
        }

        const updated = await this.getByIdInConn(conn, personId, educationId);
        if (!updated) {
            throw new Error(
                `Failed to update education Id=${educationId} for PersonId=${personId}`,
            );
        }
        return updated;
    }

    async deleteEducationFromDb(
        personId: number,
        educationId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        const [result]: any = await conn.execute(
            `DELETE ppe
             FROM PersonProfileEducations ppe
             JOIN PersonProfiles pp ON pp.Id = ppe.PersonProfileId
             WHERE pp.PersonId = ? AND ppe.Id = ?`,
            [personId, educationId],
        );
        if (!result?.affectedRows) {
            throw new Error(
                `Education Id=${educationId} not found for PersonId=${personId}`,
            );
        }
    }

    private mapRowToRecord(row: any): PersonProfileEducationV2Record {
        return {
            id: row.Id,
            personProfileId: row.PersonProfileId,
            schoolName: row.SchoolName ?? undefined,
            degreeName: row.DegreeName ?? undefined,
            fieldOfStudy: row.FieldOfStudy ?? undefined,
            dateFrom: row.DateFrom ?? undefined,
            dateTo: row.DateTo ?? undefined,
            sortOrder: row.SortOrder ?? undefined,
        };
    }

    private async getByIdInConn(
        conn: mysql.PoolConnection,
        personId: number,
        educationId: number,
    ): Promise<PersonProfileEducationV2Record | undefined> {
        const [rows] = await conn.query<any[]>(
            `SELECT
                ppe.Id,
                ppe.PersonProfileId,
                ppe.SchoolName,
                ppe.DegreeName,
                ppe.FieldOfStudy,
                ppe.DateFrom,
                ppe.DateTo,
                ppe.SortOrder
             FROM PersonProfileEducations ppe
             JOIN PersonProfiles pp ON pp.Id = ppe.PersonProfileId
             WHERE pp.PersonId = ? AND ppe.Id = ?
             LIMIT 1`,
            [personId, educationId],
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
