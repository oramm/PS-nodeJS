import { PoolConnection } from 'mysql2/promise';
import { MileageCar, MileageYear, MileageYearCar } from './MileageYear';

/** SQL only; connection, transaction and lock lifetime belong to the controller. */
export default class MileageYearRepository {
    constructor(private readonly connection: PoolConnection) {}
    private async query(sql: string, params: unknown[] = []): Promise<any> { return (await this.connection.query(sql, params))[0]; }
    async acquireLock(name: string): Promise<boolean> { const rows = await this.query('SELECT GET_LOCK(?, 30) AS Locked', [name]); return rows[0].Locked === 1; }
    async releaseLock(name: string): Promise<void> { await this.query('SELECT RELEASE_LOCK(?)', [name]); }
    async database(): Promise<string> { return (await this.query('SELECT DATABASE() AS Name'))[0].Name; }
    async find(year: number): Promise<MileageYear | undefined> { return (await this.query('SELECT * FROM MileageYears WHERE Year = ?', [year]))[0]; }
    async cars(): Promise<MileageCar[]> { return this.query('SELECT Id, LicensePlateNumber, MileageSpreadsheetId, MileageSheetGid FROM Cars ORDER BY Id'); }
    async mappings(year: number): Promise<MileageYearCar[]> { return this.query('SELECT * FROM MileageYearCars WHERE Year = ? ORDER BY CarId', [year]); }
    async add(year: MileageYear): Promise<void> { await this.query('INSERT INTO MileageYears (Year,SpreadsheetId,FolderId,FileName,OperationId,State,SourceYear) VALUES (?,?,?,?,?,?,?)', [year.Year,year.SpreadsheetId,year.FolderId,year.FileName,year.OperationId,year.State,year.SourceYear]); }
    async setState(year: number, state: MileageYear['State'], spreadsheetId: string | null): Promise<void> { await this.query('UPDATE MileageYears SET State = ?, SpreadsheetId = ? WHERE Year = ?', [state,spreadsheetId,year]); }
    async addMapping(mapping: MileageYearCar): Promise<void> { await this.query('INSERT INTO MileageYearCars (Year,CarId,SheetGid,PlateSnapshot) VALUES (?,?,?,?)', [mapping.Year,mapping.CarId,mapping.SheetGid,mapping.PlateSnapshot]); }
}
