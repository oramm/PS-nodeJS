import BaseController from '../../controllers/BaseController';
import PersonsController from '../../persons/PersonsController';
import { UserData } from '../../types/sessionTypes';
import { MailScanData } from '../../types/types';
import IncomingMail from './IncomingMail';
import MailScanRepository, { MailScanSearchParams } from './MailScanRepository';

export default class MailScansController extends BaseController<
    MailScanData,
    MailScanRepository
> {
    private static instance: MailScansController;

    constructor() {
        super(new MailScanRepository());
    }

    private static getInstance(): MailScansController {
        if (!this.instance) this.instance = new MailScansController();
        return this.instance;
    }

    static async find(
        orConditions: MailScanSearchParams[] = []
    ): Promise<MailScanData[]> {
        return await this.getInstance().repository.find(orConditions);
    }

    /**
     * Wolno zawołać WYŁĄCZNIE po zakończonym przebiegu i tylko do granicy okna, które faktycznie
     * przetworzono. Zapisany znacznik potrafi wyprzedzić wykonaną pracę: „przeskanowano do 01.08",
     * przebieg pada w połowie, maili z drugiej połowy okna nikt już nigdy nie obejrzy i nikt się
     * o tym nie dowie. Błąd jest cichy i nieodwracalny, dlatego przebieg przerwany nie zapisuje nic.
     */
    static async advance(
        params: { account: string; mailbox: string; scannedUntil: string },
        userData: UserData
    ): Promise<MailScanData> {
        if (!params.account) throw new Error('account (skrzynka) jest wymagany');
        if (!params.mailbox) throw new Error('mailbox (folder) jest wymagany');
        if (!params.scannedUntil)
            throw new Error('scannedUntil (granica okna) jest wymagany');

        const instance = this.getInstance();
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );

        await instance.repository.advance({
            account: params.account,
            mailbox: params.mailbox,
            // ten sam normalizator co przy dacie koperty: napis bez strefy bierzemy dosłownie,
            // inaczej granica okna weszłaby do bazy cofnięta o offset maszyny agenta
            scannedUntil: IncomingMail.toSqlDateTime(params.scannedUntil),
            editorId: _editor.id,
        });

        const [scan] = await instance.repository.find([
            { account: params.account, mailbox: params.mailbox },
        ]);
        return scan;
    }
}
