import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import ToolsDb from '../tools/ToolsDb';
import CarRepository from './CarRepository';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import PersonsController from '../persons/PersonsController';
import MileageValidator from './MileageValidator';
import MileageYearController from './MileageYearController';
import MileageYearProvisioner from './MileageYearProvisioner';
import MileageYearRepository from './MileageYearRepository';
import MileageTripSheet, { MileageDestination } from './MileageTripSheet';
import { mileageYearConfig, mileageFileName, MileageYearError } from './MileageYear';

export type MileageTripDto = {
    vehicleId: string; date: string; projectOurId: string; purpose: string;
    routeParts: string[]; startReading: number; endReading: number;
    fuelingDate?: string; fuelingReading?: number | ''; requestId?: string;
};
const sheetUrl = (destination: MileageDestination) => `https://docs.google.com/spreadsheets/d/${destination.spreadsheetId}/edit#gid=${destination.gid}`;
export default class MileageController {
    private static async getAuth(): Promise<OAuth2Client> {
        const refreshToken = process.env.REFRESH_TOKEN;
        if (!refreshToken) throw new Error("Can't get refresh token");
        oAuthClient.setCredentials({ refresh_token: refreshToken });
        await oAuthClient.getAccessToken();
        return oAuthClient;
    }
    /** Only SELECT and Sheets reads. Never bootstrap or provision from GET. */
    static async getVehicles(date?: unknown) {
        const businessDate = MileageValidator.businessDate(date);
        const year = Number(businessDate.slice(0, 4));
        const config = mileageYearConfig();
        mileageFileName(year, config);
        const cars = await CarRepository.getMileageCars();
        const auth = await this.getAuth();
        const sheets = new MileageTripSheet(auth);
        const connection = await ToolsDb.getPoolConnectionWithTimeout();
        const repository = new MileageYearRepository(connection);
        try {
            const destinations = new Map<number, Map<number, MileageDestination>>();
            const readDestinations = async (selectedYear: number) => {
                if (destinations.has(selectedYear)) return destinations.get(selectedYear)!;
                const record = await repository.find(selectedYear);
                const result = new Map<number, MileageDestination>();
                if (record) {
                    if (record.State !== 'READY' || !record.SpreadsheetId) throw new MileageYearError('MILEAGE_NOT_READY', 'Przygotowanie roku kilometrówki nie zostało zakończone.');
                    if (record.FolderId !== config.folderId || record.FileName !== mileageFileName(selectedYear, config) || (selectedYear === config.seedYear && record.SpreadsheetId !== config.seedSpreadsheetId)) throw new MileageYearError('CONFIG_CONFLICT', 'Konfiguracja nie odpowiada zapamiętanemu plikowi kilometrówki.');
                    for (const mapping of await repository.mappings(selectedYear)) result.set(mapping.CarId, { spreadsheetId: record.SpreadsheetId, gid: mapping.SheetGid });
                } else if (selectedYear === config.seedYear) {
                    const legacy = cars.filter(car => car.spreadsheetId !== null || car.gid !== null);
                    if (legacy.some(car => car.spreadsheetId !== config.seedSpreadsheetId || car.gid === null) || new Set(legacy.map(car => car.gid)).size !== legacy.length) throw new MileageYearError('SEED_MAPPING_CONFLICT', 'Zweryfikuj mapowania pojazdów roku początkowego.');
                    const seed = { Year: config.seedYear, SpreadsheetId: config.seedSpreadsheetId, FolderId: config.folderId, FileName: mileageFileName(config.seedYear, config), OperationId: '', State: 'READY' as const, SourceYear: null };
                    const provisioner = new MileageYearProvisioner(auth);
                    await provisioner.assertFile(seed, false);
                    const candidates = await provisioner.candidates(seed);
                    if (candidates.length !== 1 || candidates[0] !== seed.SpreadsheetId) throw new MileageYearError('FILE_CONFLICT', 'Niejednoznaczny plik roku początkowego.');
                    await provisioner.verifyMappings(seed, legacy.map(car => ({ Year: config.seedYear, CarId: car.id, SheetGid: car.gid!, PlateSnapshot: car.plate })), false, true);
                    for (const car of legacy) result.set(car.id, { spreadsheetId: config.seedSpreadsheetId, gid: car.gid! });
                }
                destinations.set(selectedYear, result);
                return result;
            };
            const current = await readDestinations(year);
            const result = [];
            for (const car of cars) {
                const destination = current.get(car.id);
                let currentReading = destination ? await sheets.reading(destination) : null;
                for (let prior = year - 1; currentReading === null && prior >= config.seedYear; prior--) {
                    const previous = (await readDestinations(prior)).get(car.id);
                    if (previous) currentReading = await sheets.reading(previous);
                }
                result.push({ id: car.id, brand: car.brand, model: car.model, plate: car.plate, currentReading, sheetUrl: destination ? sheetUrl(destination) : null, year });
            }
            return result;
        } finally { connection.release(); }
    }
    static async getDrivers(currentPersonId?: number) {
        const personIds = await StaffMemberRepository.getDriverPersonIds();
        if (!personIds.length) return [];
        const persons = await PersonsController.find(personIds.map(id => ({ id })));
        return persons.sort((a, b) => a.id === currentPersonId ? -1 : b.id === currentPersonId ? 1 : `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`, 'pl'));
    }
    static async addTripFromDto(dto: any, defaultDriver: string) {
        const driver = typeof dto?.driver === 'string' && dto.driver.trim() ? dto.driver.trim() : defaultDriver;
        return this.addTrip(dto, driver);
    }
    static async addTrip(dto: MileageTripDto, driver: string) {
        MileageValidator.trip(dto, driver);
        const year = Number(dto.date.slice(0, 4));
        const auth = await this.getAuth();
        return MileageYearController.withYear(auth, year, Number(dto.vehicleId), async prepared => {
            const mapping = prepared.mappings.find(mapping => mapping.CarId === Number(dto.vehicleId));
            if (!mapping || !prepared.year.SpreadsheetId) throw new MileageYearError('CAR_NOT_FOUND', 'Brak zakładki pojazdu dla wybranego roku.');
            const destination = { spreadsheetId: prepared.year.SpreadsheetId, gid: mapping.SheetGid };
            const parts = dto.routeParts.map(part => part.trim()).filter(Boolean);
            const route = new Set(parts).size === 1 ? parts[0] : parts.join(' - ');
            const data = [dto.date, dto.projectOurId, dto.purpose, route, dto.startReading, dto.endReading, dto.endReading - dto.startReading, driver, dto.fuelingDate ?? '', dto.fuelingReading ?? ''];
            const trip = await new MileageTripSheet(auth).write(destination, data, dto.requestId, `${Number(dto.vehicleId)}:${year}`, dto.purpose.split(',').some(p => p.trim().toLowerCase() === 'tankowanie'));
            return { ...trip, sheetUrl: sheetUrl(destination), year };
        });
    }
}
