import OfferBond from './OfferBond';
import Setup from '../../setup/Setup';
import { ExternalOfferData, OurOfferData } from '../../types/types';
import BaseController from '../../controllers/BaseController';
import OfferBondRepository, {
    OfferBondSearchParams,
} from './OfferBondRepository';

/**
 * Controller dla OfferBond - warstwa aplikacji/serwisów
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseController<OfferBond, OfferBondRepository>
 * - Orkiestruje operacje (Repository + Model)
 * - Zarządza transakcjami
 * - NIE zawiera SQL ani logiki biznesowej
 */
export default class OfferBondsController extends BaseController<
    OfferBond,
    OfferBondRepository
> {
    private static instance: OfferBondsController;

    constructor() {
        super(new OfferBondRepository());
    }

    /**
     * Singleton pattern - zwraca instancję controllera
     */
    private static getInstance(): OfferBondsController {
        if (!this.instance) {
            this.instance = new OfferBondsController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje wadiów w bazie danych
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<OfferBond[]> - Lista znalezionych wadiów
     */
    static async getOfferBondsList(
        orConditions: OfferBondSearchParams[] = []
    ): Promise<OfferBond[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * Dodaje nowe wadium do bazy danych
     *
     * REFAKTORING: Logika przeniesiona z OfferBond.addNewController()
     * Controller używa Repository zamiast wywoływać metody bezpośrednio na Model.
     *
     * @param offerBond - Wadium do dodania
     * @param offer - Opcjonalna oferta (dla wysyłki maila)
     * @returns Promise<OfferBond> - Dodane wadium
     */
    static async addNew(
        offerBond: OfferBond,
        offer?: ExternalOfferData | OurOfferData
    ): Promise<OfferBond> {
        const instance = this.getInstance();

        try {
            console.group('Creating new OfferBond');
            await instance.repository.addInDb(offerBond);

            // Wysyłka maila jeśli oferta TO_DO i wadium TO_PAY
            if (
                offer?.status === Setup.OfferStatus.TO_DO &&
                offerBond.status === Setup.OfferBondStatus.TO_PAY
            ) {
                offerBond.sendMailOnToDo(offer as ExternalOfferData);
            }

            console.log('OfferBond added to db');
            console.groupEnd();

            return offerBond;
        } catch (err) {
            await this.delete(offerBond);
            throw err;
        }
    }

    /**
     * Edytuje istniejące wadium
     *
     * REFAKTORING: Logika przeniesiona z OfferBond.editController()
     * Controller używa Repository zamiast wywoływać metody bezpośrednio na Model.
     *
     * @param offerBond - Wadium do edycji
     * @param offer - Oferta (dla wysyłki maila przy zmianie statusu)
     */
    static async edit(
        offerBond: OfferBond,
        offer: ExternalOfferData
    ): Promise<void> {
        const instance = this.getInstance();

        try {
            console.group('Editing OfferBond');
            await instance.repository.editInDb(offerBond);
            console.log('OfferBond edited in db');

            // Wysyłka maila przy zmianie statusu
            this.sendMailOnStatusChange(offerBond, offer);

            console.groupEnd();
        } catch (err) {
            console.log('OfferBond edit error');
            throw err;
        }
    }

    /**
     * Usuwa wadium z bazy danych
     *
     * REFAKTORING: Logika przeniesiona z OfferBond.deleteController()
     * Controller używa Repository zamiast wywoływać metody bezpośrednio na Model.
     *
     * @param offerBond - Wadium do usunięcia
     */
    static async delete(offerBond: OfferBond): Promise<void> {
        if (!offerBond.id) throw new Error('No offerBond id');
        const instance = this.getInstance();
        await instance.repository.delete(offerBond);
    }

    /**
     * Wysyła email przy zmianie statusu wadium
     *
     * REFAKTORING: Orkiestracja wywołania metod z OfferBond
     * Controller decyduje KIEDY wysłać, Model enkapsuluje szczegóły wysyłki.
     *
     * @param offerBond - Wadium
     * @param offer - Oferta
     */
    static sendMailOnStatusChange(
        offerBond: OfferBond,
        offer: ExternalOfferData
    ): void {
        switch (offerBond.status) {
            case Setup.OfferBondStatus.TO_PAY:
                offerBond.sendMailOnToDo(offer);
                break;
            case Setup.OfferBondStatus.PAID:
                offerBond.sendMailOnPaid(offer);
                break;
        }
    }
}
