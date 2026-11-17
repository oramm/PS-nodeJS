import ToolsDb from '../tools/ToolsDb';

export type MileageVehicle = {
    id: number; brand: string; model: string; plate: string;
    spreadsheetId: string | null; gid: number | null;
};
export default class CarRepository {
    /** Every retained Cars identity participates, including cars without a legacy tab. */
    static async getMileageCars(): Promise<MileageVehicle[]> {
        const rows = await ToolsDb.getQueryCallbackAsync(`SELECT Id, Brand, Model, LicensePlateNumber, MileageSpreadsheetId, MileageSheetGid FROM Cars ORDER BY Brand, Model`) as any[];
        return rows.map(r => ({ id: r.Id, brand: r.Brand, model: r.Model ?? '', plate: r.LicensePlateNumber, spreadsheetId: r.MileageSpreadsheetId, gid: r.MileageSheetGid }));
    }
}
