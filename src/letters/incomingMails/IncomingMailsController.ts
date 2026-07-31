import BaseController from '../../controllers/BaseController';
import PersonsController from '../../persons/PersonsController';
import { UserData } from '../../types/sessionTypes';
import IncomingMail from './IncomingMail';
import IncomingMailRepository, {
    IncomingMailSearchParams,
} from './IncomingMailRepository';

/** Kod błędu MySQL/MariaDB dla naruszenia klucza unikalnego */
const DUPLICATE_ENTRY_ERRNO = 1062;

export type IncomingMailRegistrationResult = {
    /** false = ten mail był już przerobiony; wynik jest pominięciem, nie sukcesem */
    isNew: boolean;
    mail: IncomingMail;
};

export default class IncomingMailsController extends BaseController<
    IncomingMail,
    IncomingMailRepository
> {
    private static instance: IncomingMailsController;

    constructor() {
        super(new IncomingMailRepository());
    }

    private static getInstance(): IncomingMailsController {
        if (!this.instance) this.instance = new IncomingMailsController();
        return this.instance;
    }

    static async find(
        orConditions: IncomingMailSearchParams[] = []
    ): Promise<IncomingMail[]> {
        return await this.getInstance().repository.find(orConditions);
    }

    /**
     * Rejestruje kopertę albo oddaje tę, która już jest.
     *
     * Rozstrzyga o tym baza, nie sprawdzenie przed zapisem: `SELECT` przed `INSERT` przepuściłby
     * dwa równoległe skany tej samej skrzynki. Jedynym strażnikiem jest `UNIQUE` na `MessageId`,
     * a duplikat klucza to normalny wynik, nie awaria.
     *
     * `isNew=false` znaczy „ten mail był już przerobiony”. Wywołujący ma wtedy pominąć rejestrację
     * pisma — chyba że koperta nie ma jeszcze żadnego pisma (`_lettersCount = 0`), bo to jest
     * ścieżka reklasyfikacji z G-PRZ-5: mail zarejestrowany bez pisma dostaje pismo później,
     * przy tej samej kopercie.
     */
    static async register(
        mail: IncomingMail,
        userData: UserData
    ): Promise<IncomingMailRegistrationResult> {
        const instance = this.getInstance();
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );
        mail._editor = _editor;
        mail.editorId = _editor.id;

        try {
            await instance.repository.addInDb(mail);
            mail._lettersCount = 0;
            return { isNew: true, mail };
        } catch (error: any) {
            if (
                error?.errno !== DUPLICATE_ENTRY_ERRNO &&
                error?.code !== 'ER_DUP_ENTRY'
            )
                throw error;

            const [existing] = await instance.repository.find([
                { messageId: mail.messageId },
            ]);
            if (!existing) throw error;

            return { isNew: false, mail: existing };
        }
    }
}
