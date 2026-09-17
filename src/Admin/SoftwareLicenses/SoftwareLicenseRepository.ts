import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import SoftwareLicense, { SoftwareLicenseData } from './SoftwareLicense';
import { SoftwareLicensesSearchParams } from './SoftwareLicenseValidator';

const fields: (keyof SoftwareLicenseData)[] = [
    'manufacturer', 'product', 'version', 'licenseType', 'registrationAccount',
    'vendorPanelUrl', 'googleDriveUrl', 'seatsPurchased', 'seatsUsed', 'assignment', 'purchaseDate',
    'expirationDate', 'cost', 'billingCycle', 'status', 'comment',
];
const column = (field: string) => field[0].toUpperCase() + field.slice(1);

export default class SoftwareLicenseRepository extends BaseRepository<SoftwareLicense> {
    constructor() { super('SoftwareLicenses'); }

    // ToolsDb's generic writes log SQL values on failure. Never use them for keys.
    // Do not retry a write after a lost response: its commit outcome is unknown.
    private async query(sql: string, values: any[], conn?: mysql.PoolConnection): Promise<any> {
        try {
            return (await (conn || ToolsDb.pool).query(sql, values))[0];
        } catch {
            // mysql errors may carry sql/sqlMessage including bound ciphertext.
            throw new Error('Nie można wykonać operacji na licencjach.');
        }
    }

    async find(orConditions: SoftwareLicensesSearchParams[] = [{}], conn?: mysql.PoolConnection, lock = false): Promise<SoftwareLicense[]> {
        const values: any[] = [];
        const where = this.makeOrGroupsConditions(orConditions, (p) => this.makeAndConditions(p, values));
        const selected = fields.map((f) => ['purchaseDate', 'expirationDate'].includes(f)
            ? `DATE_FORMAT(${column(f)}, '%Y-%m-%d') AS ${column(f)}` : column(f));
        const rows: RowDataPacket[] = await this.query(`SELECT Id, ${selected.join(', ')},
            (EncryptedLicenseKey IS NOT NULL) AS HasLicenseKey,
            DATE_FORMAT(CreatedAt, '%Y-%m-%d %H:%i:%s') AS CreatedAt,
            DATE_FORMAT(UpdatedAt, '%Y-%m-%d %H:%i:%s') AS UpdatedAt
            FROM SoftwareLicenses WHERE ${where} ORDER BY Manufacturer, Product, Id${lock ? ' FOR UPDATE' : ''}`, values, conn);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(p: SoftwareLicensesSearchParams, values: any[]): string {
        const conditions: string[] = [];
        if (p.id !== undefined) { conditions.push('Id = ?'); values.push(p.id); }
        if (p.searchText) {
            for (const word of p.searchText.split(/\s+/).filter(Boolean)) {
                conditions.push('(Manufacturer LIKE ? OR Product LIKE ? OR Version LIKE ? OR Assignment LIKE ?)');
                values.push(...Array(4).fill(`%${word}%`));
            }
        }
        return conditions.join(' AND ') || '1';
    }

    protected mapRowToModel(row: RowDataPacket): SoftwareLicense {
        const data = Object.fromEntries(fields.map((f) => [f, row[column(f)]])) as unknown as SoftwareLicenseData;
        data.cost = row.Cost === null ? null : Number(row.Cost).toFixed(2);
        return new SoftwareLicense(data, row.Id, !!row.HasLicenseKey, row.CreatedAt, row.UpdatedAt);
    }

    async addInDb(item: SoftwareLicense, conn?: mysql.PoolConnection, _isPartOfTransaction?: boolean, encryptedKey: string | null = null): Promise<void> {
        const values = fields.map((f) => item.data[f]);
        const result: ResultSetHeader = await this.query(`INSERT INTO SoftwareLicenses
            (${fields.map(column).join(', ')}, EncryptedLicenseKey)
            VALUES (${[...values, encryptedKey].map(() => '?').join(', ')})`, [...values, encryptedKey], conn);
        item.id = result.insertId;
    }

    async editInDb(item: SoftwareLicense, conn?: mysql.PoolConnection, _isPartOfTransaction?: boolean, _fields?: string[], encryptedKey?: string | null): Promise<void> {
        const assignments = fields.map((f) => `${column(f)} = ?`);
        const values: any[] = fields.map((f) => item.data[f]);
        if (encryptedKey !== undefined) { assignments.push('EncryptedLicenseKey = ?'); values.push(encryptedKey); }
        await this.query(`UPDATE SoftwareLicenses SET ${assignments.join(', ')} WHERE Id = ?`, [...values, item.id], conn);
    }

    async findEncryptedKey(id: number, conn: mysql.PoolConnection): Promise<string | null | undefined> {
        const rows: RowDataPacket[] = await this.query(
            'SELECT EncryptedLicenseKey FROM SoftwareLicenses WHERE Id = ? FOR UPDATE', [id], conn);
        return rows[0]?.EncryptedLicenseKey;
    }

    async recordKeyReveal(id: number, actorPersonId: number, conn: mysql.PoolConnection): Promise<void> {
        await this.query(`INSERT INTO SoftwareLicenseKeyEvents (SoftwareLicenseId, ActorPersonId, RevealedAt)
            VALUES (?, ?, UTC_TIMESTAMP(6))`, [id, actorPersonId], conn);
    }

    async deleteFromDb(item: SoftwareLicense, conn?: mysql.PoolConnection): Promise<void> {
        await this.query('DELETE FROM SoftwareLicenses WHERE Id = ?', [item.id], conn);
    }
}
