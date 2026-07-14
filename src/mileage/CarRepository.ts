import ToolsDb from '../tools/ToolsDb';

export type MileageVehicle = {
    id: number;
    brand: string;
    model: string;
    plate: string;
    spreadsheetId: string;
    gid: number;
};

export default class CarRepository {
    /** Auta z przypisanym arkuszem kilometrówki (aktywne). */
    static async getMileageCars(): Promise<MileageVehicle[]> {
        const sql = `SELECT Id, Brand, Model, LicensePlateNumber, MileageSpreadsheetId, MileageSheetGid
                     FROM Cars
                     WHERE IsActive = 1
                       AND MileageSpreadsheetId IS NOT NULL
                       AND MileageSheetGid IS NOT NULL
                     ORDER BY Brand, Model`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return rows.map((r) => ({
            id: r.Id,
            brand: r.Brand,
            model: r.Model ?? '',
            plate: r.LicensePlateNumber,
            spreadsheetId: r.MileageSpreadsheetId,
            gid: r.MileageSheetGid,
        }));
    }
}
