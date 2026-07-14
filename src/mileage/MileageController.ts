import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import ToolsSheets from '../tools/ToolsSheets';
import ToolsVision from '../tools/ToolsVision';
import CarRepository, { MileageVehicle } from './CarRepository';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import PersonsController from '../persons/PersonsController';

const SHEET_RANGE = 'A:K';
const HEADER_ROWS = 1;
const END_READING_COL = 'G'; // stan licznika końcowy = bieżący przebieg
const MAX_PLAUSIBLE_TRIP_KM = 1500;
const READING_DIGITS = 6;
// Google Sheets "jasnożółty 3" (light yellow 3) = #fff2cc
const FUELING_ROW_COLOR = { red: 1, green: 0.9490196, blue: 0.8 };

// Cache tytułów zakładek (gid → title). Struktura arkusza jest stabilna, więc
// unikamy powtarzania spreadsheets.get przy każdym ładowaniu listy aut.
const sheetTitleCache = new Map<string, string>();
const titleCacheKey = (spreadsheetId: string, gid: number) =>
    `${spreadsheetId}:${gid}`;

export type MileageTripDto = {
    vehicleId: string;
    date: string;
    projectOurId: string;
    purpose: string;
    routeParts: string[];
    startReading: number;
    endReading: number;
    fuelingDate?: string;
    fuelingReading?: number | '';
};

function parseReading(cell: unknown): number | null {
    if (cell === undefined || cell === null || cell === '') return null;
    const digits = String(cell).replace(/\D/g, '');
    return digits ? Number(digits) : null;
}

/**
 * Łączy 3 pola opisu trasy w format "skąd - przez - dokąd".
 * Gdy wszystkie niepuste człony są identyczne (np. "Brzeg/Brzeg/Brzeg" dla
 * tankowania) - zwija do jednej wartości "Brzeg".
 */
function buildRoute(parts: string[]): string {
    const cleaned = (parts ?? []).map((p) => (p ?? '').trim()).filter(Boolean);
    if (cleaned.length === 0) return '';
    if (new Set(cleaned).size === 1) return cleaned[0];
    return cleaned.join(' - ');
}

export default class MileageController {
    private static async getVehicle(vehicleId: string): Promise<MileageVehicle> {
        const cars = await CarRepository.getMileageCars();
        const vehicle = cars.find((v) => String(v.id) === String(vehicleId));
        if (!vehicle) throw new Error(`Nieznany pojazd: ${vehicleId}`);
        return vehicle;
    }

    private static async getAuth(): Promise<OAuth2Client> {
        const refreshToken = process.env.REFRESH_TOKEN;
        if (!refreshToken) throw new Error("Can't get refresh token");
        oAuthClient.setCredentials({ refresh_token: refreshToken });
        await oAuthClient.getAccessToken();
        return oAuthClient;
    }

    /**
     * Uzupełnia cache tytułów zakładek dla wszystkich aut - jednym spreadsheets.get
     * na każdy odrębny arkusz (auta zwykle dzielą ten sam plik → 1 wywołanie).
     */
    private static async warmSheetTitles(
        auth: OAuth2Client,
        cars: MileageVehicle[]
    ): Promise<void> {
        const missingSpreadsheetIds = [
            ...new Set(
                cars
                    .filter(
                        (c) =>
                            !sheetTitleCache.has(titleCacheKey(c.spreadsheetId, c.gid))
                    )
                    .map((c) => c.spreadsheetId)
            ),
        ];
        await Promise.all(
            missingSpreadsheetIds.map(async (spreadsheetId) => {
                const spreadsheet = await ToolsSheets.getSpreadSheet(
                    auth,
                    spreadsheetId
                );
                for (const sheet of spreadsheet.data.sheets ?? []) {
                    const gid = sheet.properties?.sheetId;
                    const title = sheet.properties?.title;
                    if (gid != null && title)
                        sheetTitleCache.set(
                            titleCacheKey(spreadsheetId, gid),
                            title
                        );
                }
            })
        );
    }

    private static async resolveSheetTitle(
        auth: OAuth2Client,
        vehicle: MileageVehicle
    ): Promise<string> {
        const cached = sheetTitleCache.get(
            titleCacheKey(vehicle.spreadsheetId, vehicle.gid)
        );
        if (cached) return cached;
        await this.warmSheetTitles(auth, [vehicle]);
        const title = sheetTitleCache.get(
            titleCacheKey(vehicle.spreadsheetId, vehicle.gid)
        );
        if (!title)
            throw new Error(
                `Nie znaleziono zakładki (gid=${vehicle.gid}) w arkuszu pojazdu ${vehicle.plate}`
            );
        return title;
    }

    private static async getDataRows(
        auth: OAuth2Client,
        vehicle: MileageVehicle,
        title: string
    ): Promise<any[][]> {
        const { values } = await ToolsSheets.getValues(auth, {
            spreadsheetId: vehicle.spreadsheetId,
            rangeA1: `${title}!${SHEET_RANGE}`,
        });
        return (values ?? []).slice(HEADER_ROWS);
    }

    private static async getCurrentReading(
        auth: OAuth2Client,
        vehicle: MileageVehicle,
        title: string
    ): Promise<number | null> {
        // Czytamy tylko kolumnę ze stanem końcowym - lżejsze niż całe A:K.
        const { values } = await ToolsSheets.getValues(auth, {
            spreadsheetId: vehicle.spreadsheetId,
            rangeA1: `${title}!${END_READING_COL}${HEADER_ROWS + 1}:${END_READING_COL}`,
        });
        const lastValue = (values ?? [])
            .map((row) => row?.[0])
            .filter((v) => v !== undefined && v !== '')
            .pop();
        return parseReading(lastValue);
    }

    /** Lista pojazdów z aktualnym stanem licznika (dla kafelków wyboru). */
    static async getVehicles() {
        const cars = await CarRepository.getMileageCars();
        const auth = await this.getAuth();
        await this.warmSheetTitles(auth, cars); // 1 spreadsheets.get na plik
        return Promise.all(
            cars.map(async (vehicle) => {
                const title = await this.resolveSheetTitle(auth, vehicle);
                return {
                    id: vehicle.id,
                    brand: vehicle.brand,
                    model: vehicle.model,
                    plate: vehicle.plate,
                    currentReading: await this.getCurrentReading(
                        auth,
                        vehicle,
                        title
                    ),
                };
            })
        );
    }

    /** Kierowcy (StaffMembers.IsDriver) - zalogowany na początku listy (domyślny wybór). */
    static async getDrivers(currentPersonId?: number) {
        const personIds = await StaffMemberRepository.getDriverPersonIds();
        if (personIds.length === 0) return [];
        const persons = await PersonsController.find(
            personIds.map((id) => ({ id }))
        );
        return persons.sort((a, b) => {
            if (a.id === currentPersonId) return -1;
            if (b.id === currentPersonId) return 1;
            return `${a.surname} ${a.name}`.localeCompare(
                `${b.surname} ${b.name}`,
                'pl'
            );
        });
    }

    static async scanOdometer(
        vehicleId: string,
        previousEndReading: number | null,
        imageBuffer: Buffer
    ) {
        await this.getVehicle(vehicleId); // walidacja istnienia pojazdu
        const auth = await this.getAuth();
        const blocks = await ToolsVision.detectDigitBlocks(auth, imageBuffer);
        const candidates = blocks
            .filter((b) => b.digits.length === READING_DIGITS)
            .filter((b) => {
                if (previousEndReading == null) return true;
                const value = Number(b.digits);
                return (
                    value >= previousEndReading &&
                    value <= previousEndReading + MAX_PLAUSIBLE_TRIP_KM
                );
            })
            .sort((a, b) => b.height - a.height)
            .map((b) => Number(b.digits));
        return [...new Set(candidates)].slice(0, 5);
    }

    static async addTrip(dto: MileageTripDto, driver: string) {
        const vehicle = await this.getVehicle(dto.vehicleId);
        const auth = await this.getAuth();
        const title = await this.resolveSheetTitle(auth, vehicle);
        const dataRows = await this.getDataRows(auth, vehicle, title);
        const nextLp = dataRows.length + 1;
        const km = dto.endReading - dto.startReading;
        const isFueling = dto.purpose
            .split(',')
            .some((p) => p.trim().toLowerCase() === 'tankowanie');

        const row = [
            nextLp,
            dto.date,
            dto.projectOurId,
            dto.purpose,
            buildRoute(dto.routeParts),
            dto.startReading,
            dto.endReading,
            km,
            driver,
            dto.fuelingDate ?? '',
            dto.fuelingReading ?? '',
        ];

        const rowNumber = HEADER_ROWS + dataRows.length + 1; // 1-based nr wiersza
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: vehicle.spreadsheetId,
            rangeA1: `${title}!A${rowNumber}`,
            values: [row],
        });

        if (isFueling)
            await this.formatFuelingRow(auth, vehicle, rowNumber - 1);

        return { lp: nextLp, km };
    }

    private static async formatFuelingRow(
        auth: OAuth2Client,
        vehicle: MileageVehicle,
        rowIndex: number
    ) {
        const rowRange = {
            sheetId: vehicle.gid,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
        };
        await ToolsSheets.batchUpdateSheet(
            auth,
            [
                {
                    repeatCell: {
                        range: { ...rowRange, startColumnIndex: 0, endColumnIndex: 11 }, // A-K
                        cell: {
                            userEnteredFormat: { backgroundColor: FUELING_ROW_COLOR },
                        },
                        fields: 'userEnteredFormat.backgroundColor',
                    },
                },
                {
                    repeatCell: {
                        range: { ...rowRange, startColumnIndex: 10, endColumnIndex: 11 }, // K
                        cell: {
                            userEnteredFormat: {
                                numberFormat: { type: 'NUMBER', pattern: '0' },
                            },
                        },
                        fields: 'userEnteredFormat.numberFormat',
                    },
                },
            ],
            vehicle.spreadsheetId
        );
    }
}
