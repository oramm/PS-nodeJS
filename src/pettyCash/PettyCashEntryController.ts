import ToolsSheets from '../tools/ToolsSheets';
import AnnualSheetStructureError from './sheets/AnnualSheetStructureError';
import { OAuth2Client } from 'google-auth-library';
import Setup from '../setup/Setup';
import PettyCashEntry from './PettyCashEntry';
import PettyCashEntryValidator, {
    PettyCashEntryDto,
    PettyCashValidationError,
} from './PettyCashEntryValidator';
import PettyCashWriter, { WritePlan } from './sheets/PettyCashWriter';
import PostalRegisterWriter, { RegisterPlan } from './sheets/PostalRegisterWriter';
import getSheetsAuth from './sheets/sheetsAuth';

export class PettyCashError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
        this.name = 'PettyCashError';
    }
}

export type PostalOutcome = { register: 'complete' | 'absent' | 'conflict' | 'unknown'; cash: 'complete' | 'absent' | 'conflict' | 'unknown' };
export class PostalCommitError extends PettyCashError {
    readonly code = 'POSTAL_COMMIT_INCOMPLETE';
    constructor(readonly outcome: PostalOutcome) {
        const labels = { complete: 'zapis potwierdzony', absent: 'brak wpisu', conflict: 'inna lub niepełna treść', unknown: 'stan niepotwierdzony' };
        super(409, `Poczta: ${labels[outcome.register]}. Zaliczki: ${labels[outcome.cash]}. ` +
            (Object.values(outcome).includes('conflict') ? 'Sprawdź wpisy w arkuszach.' : 'Ponów ten sam wpis, aby sprawdzić i uzupełnić zapis.'));
    }
}

export type CommitResult = {
    register: RegisterPlan | null;
    cash: WritePlan;
};

/**
 * Orkiestracja zapisu wpisu do arkuszy.
 *
 * Nie dziedziczy po `BaseController`, bo ta klasa wymaga repozytorium, a modul nie ma
 * bazy danych - zrodlem prawdy sa arkusze.
 *
 * Pocztowy zapis uzgadnia dwa pliki pod blokadą writera. Ponowienie sprawdza treść
 * istniejących wpisów; po błędzie transportu stan potwierdza odczyt.
 */
export default class PettyCashEntryController {
    private static config() {
        const { spreadsheetId, registerSpreadsheetId, trackingUrlTemplate } =
            Setup.PettyCash;
        if (!spreadsheetId)
            throw new PettyCashError(
                500,
                'Brak PETTY_CASH_SPREADSHEET_ID - nie wiadomo, do ktorego arkusza pisac.'
            );
        return { spreadsheetId, registerSpreadsheetId, trackingUrlTemplate };
    }

    /** Router wola wlasnie to: DTO wchodzi, zapis do arkuszy wychodzi. */
    static async addFromDto(
        dto: PettyCashEntryDto,
        auth?: OAuth2Client
    ): Promise<CommitResult> {
        const entry = PettyCashEntryValidator.buildAndValidate(dto);
        return await this.add(entry, auth);
    }

    static async add(
        entry: PettyCashEntry,
        auth?: OAuth2Client
    ): Promise<CommitResult> {
        const { spreadsheetId, registerSpreadsheetId, trackingUrlTemplate } =
            this.config();
        const client = await getSheetsAuth(auth);

        if (entry.requiresPostalDispatch) {
            if (!registerSpreadsheetId) throw new PettyCashError(500, 'Brak konfiguracji arkusza poczty.');
            return PettyCashWriter.withWriteLock(spreadsheetId, async () => {
                const year = Number(entry.entryDate.slice(0, 4));
                // Provisioning contains no business rows. Both destinations must validate first.
                const postalSnapshot = await PostalRegisterWriter.ensureDestination(client, registerSpreadsheetId, year);
                const cashSnapshot = await PettyCashWriter.ensureDestination(client, entry, spreadsheetId);
                let register = PostalRegisterWriter.plan(entry, postalSnapshot, trackingUrlTemplate);
                const cashExisting = PettyCashWriter.inspectPostalEntry(entry, cashSnapshot);
                const cashPlan = cashExisting ?? PettyCashWriter.plan(entry, cashSnapshot);
                if (register.action === 'blocked' || cashPlan.action === 'blocked') {
                    throw new PostalCommitError({
                        register: register.action === 'skip' ? 'complete' : register.action === 'blocked' ? 'conflict' : 'absent',
                        cash: cashPlan.action === 'skip' ? 'complete' : cashPlan.action === 'blocked' ? 'conflict' : 'absent',
                    });
                }
                try {
                    if (register.action === 'write') await ToolsSheets.batchUpdateSheet(client, register.requests, registerSpreadsheetId);
                    const cash = cashExisting ?? await PettyCashWriter.writeLocked(client, entry, { spreadsheetId });
                    if (cash.action === 'blocked') throw new Error('Cash destination changed');
                    return { register, cash };
                } catch {
                    // A rejected transport may have committed. Never infer absence from rejection.
                    const classify = (plan: RegisterPlan | WritePlan | null): PostalOutcome['cash'] =>
                        plan === null ? 'absent' : plan.action === 'skip' ? 'complete' : 'conflict';
                    let registerState: PostalOutcome['register'] = 'unknown', cashState: PostalOutcome['cash'] = 'unknown';
                    let confirmedRegister: RegisterPlan | null = null, confirmedCash: WritePlan | null = null;
                    try { confirmedRegister = PostalRegisterWriter.inspectEntry(entry, await PostalRegisterWriter.loadSnapshot(client, registerSpreadsheetId, year)); registerState = classify(confirmedRegister); } catch {}
                    try { confirmedCash = PettyCashWriter.inspectPostalEntry(entry, await PettyCashWriter.loadSnapshot(client, spreadsheetId, year)); cashState = classify(confirmedCash); } catch {}
                    if (registerState === 'complete' && cashState === 'complete') {
                        return { register, cash: cashPlan.action === 'write' && confirmedCash?.action === 'skip'
                            ? { ...cashPlan, targetRow: confirmedCash.existingRow } : cashPlan };

                    }
                    throw new PostalCommitError({ register: registerState, cash: cashState });
                }
            });
        }
        const cash = await PettyCashWriter.write(client, entry, { spreadsheetId });
        if (cash.action === 'blocked') {
            if (cash.code) throw new AnnualSheetStructureError(cash.code, 'cash', Number(entry.entryDate.slice(0, 4)), cash.reason);
            throw new PettyCashError(409, cash.reason);
        }
        return { register: null, cash };
    }
}

export { PettyCashValidationError };
