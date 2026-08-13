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
 * Kolejnosc zapisu: najpierw rejestr listow, potem wiersz w zaliczkach. Google nie daje
 * transakcji miedzy plikami, wiec zapis moze urwac sie w polowie; rejestr idzie pierwszy,
 * bo to on ma wieksza szanse odmowic, wiec w typowym bledzie arkusze zostaja nietkniete.
 * Gdy mimo to blok powstanie, a wiersz nie - blad mowi o tym wprost i wiersz dopisuje sie
 * recznie w arkuszu.
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

        let register: RegisterPlan | null = null;

        if (entry.requiresPostalDispatch) {
            if (!registerSpreadsheetId)
                throw new PettyCashError(
                    500,
                    'Brak POSTAL_REGISTER_SPREADSHEET_ID - nie wiadomo, gdzie zapisac liste listow.'
                );

            register = await PostalRegisterWriter.write(client, entry, {
                spreadsheetId: registerSpreadsheetId,
                trackingUrlTemplate,
            });

            if (register.action === 'blocked')
                throw new PettyCashError(
                    409,
                    `Rejestr listow odmowil zapisu: ${register.reason}`
                );
        }

        const cash = await PettyCashWriter.write(client, entry, { spreadsheetId });

        if (cash.action === 'blocked') {
            const orphan =
                register?.action === 'write'
                    ? ` Uwaga: blok ${register.blockNumber} w rejestrze listow zostal juz zapisany ` +
                      `(wiersz ${register.headerRow}) - wiersz w zaliczkach dopisz recznie.`
                    : '';
            throw new PettyCashError(
                409,
                `Arkusz zaliczek odmowil zapisu: ${cash.reason}.${orphan}`
            );
        }

        return { register, cash };
    }
}

export { PettyCashValidationError };
