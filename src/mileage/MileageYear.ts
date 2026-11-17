export type MileageYear = {
    Year: number; SpreadsheetId: string | null; FolderId: string;
    FileName: string; OperationId: string; State: 'PLANNED' | 'CREATING' | 'READY';
    SourceYear: number | null;
};
export type MileageCar = {
    Id: number; LicensePlateNumber: string;
    MileageSpreadsheetId: string | null; MileageSheetGid: number | null;
};
export type MileageYearCar = { Year: number; CarId: number; SheetGid: number; PlateSnapshot: string };
export class MileageYearError extends Error {
    constructor(public readonly code: string, message: string) { super(message); this.name = 'MileageYearError'; }
}
export type MileageYearConfig = { folderId: string; seedYear: number; seedSpreadsheetId: string; seedSeries: number };
export function mileageYearConfig(): MileageYearConfig {
    const config = {folderId: process.env.MILEAGE_YEAR_FOLDER_ID || '', seedYear: Number(process.env.MILEAGE_SEED_YEAR), seedSpreadsheetId: process.env.MILEAGE_SEED_SPREADSHEET_ID || '', seedSeries: Number(process.env.MILEAGE_SEED_SERIES)};
    if (!config.folderId || !config.seedSpreadsheetId || !Number.isInteger(config.seedYear) || config.seedYear < 2000 || !Number.isInteger(config.seedSeries) || config.seedSeries < 1)
        throw new MileageYearError('CONFIG_REQUIRED', 'Uzupełnij i zweryfikuj konfigurację początkowego roku kilometrówki.');
    return config;
}
export function mileageFileName(year: number, config: MileageYearConfig): string {
    const series = config.seedSeries + year - config.seedYear;
    if (!Number.isInteger(year) || year < config.seedYear || year > 9999 || series < 1)
        throw new MileageYearError('INVALID_YEAR', 'Nieprawidłowy rok kilometrówki.');
    return `${String(series).padStart(2, '0')}. Ewidencja przebiegu pojazdów ${year} ENVI SC`;
}
