import { OAuth2Client } from 'google-auth-library';
import BaseController from '../../controllers/BaseController';
import Setup from '../../setup/Setup';
import { OfferData } from '../../types/types';
import OfferEvent from './OfferEvent';
import OfferEventRepository, {
    OfferEventSearchParams,
} from './OfferEventRepository';

/**
 * Controller dla OfferEvent - warstwa aplikacji/serwisów
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseController<OfferEvent, OfferEventRepository>
 * - Orkiestruje operacje (Repository + Model)
 * - Zarządza transakcjami
 * - NIE zawiera SQL ani logiki biznesowej
 */
export default class OfferEventsController extends BaseController<
    OfferEvent,
    OfferEventRepository
> {
    private static instance: OfferEventsController;

    constructor() {
        super(new OfferEventRepository());
    }

    /**
     * Singleton pattern - zwraca instancję controllera
     */
    private static getInstance(): OfferEventsController {
        if (!this.instance) {
            this.instance = new OfferEventsController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje wydarzenia ofert w bazie danych
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<OfferEvent[]> - Lista znalezionych wydarzeń
     */
    static async getOfferEventsList(
        orConditions: OfferEventSearchParams[] = []
    ): Promise<OfferEvent[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * Dodaje nowe wydarzenie oferty do bazy danych
     *
     * REFAKTORING: Logika przeniesiona z OfferEvent.addNewController()
     * Controller używa Repository zamiast wywoływać metody bezpośrednio na Model.
     *
     * @param offerEvent - Wydarzenie oferty do dodania
     * @returns Promise<OfferEvent> - Dodane wydarzenie z wygenerowanym versionNumber
     */
    static async addNew(offerEvent: OfferEvent): Promise<OfferEvent> {
        const instance = this.getInstance();

        try {
            // Oblicz numer wersji dla typu SENT
            if (offerEvent.eventType === Setup.OfferEventType.SENT) {
                const previousEvents = await instance.repository.find([
                    {
                        offerId: offerEvent.offerId,
                        eventType: Setup.OfferEventType.SENT,
                    },
                ]);
                offerEvent.versionNumber =
                    previousEvents.filter(
                        (event) => event.eventType === Setup.OfferEventType.SENT
                    ).length + 1;
            }

            console.group('Creating new OfferEvent');
            await instance.repository.addInDb(offerEvent);
            console.log('OfferEvent added to db');
            console.groupEnd();

            return offerEvent;
        } catch (err) {
            await this.delete(offerEvent);
            throw err;
        }
    }

    /**
     * Edytuje istniejące wydarzenie oferty
     *
     * REFAKTORING: Logika przeniesiona z OfferEvent.editController()
     * Controller używa Repository zamiast wywoływać metody bezpośrednio na Model.
     *
     * @param offerEvent - Wydarzenie oferty do edycji
     */
    static async edit(offerEvent: OfferEvent): Promise<void> {
        const instance = this.getInstance();

        try {
            console.group('Editing OfferEvent');
            await instance.repository.editInDb(offerEvent);
            console.log('OfferEvent edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('OfferEvent edit error');
            throw err;
        }
    }

    /**
     * Usuwa wydarzenie oferty z bazy danych
     *
     * REFAKTORING: Logika przeniesiona z OfferEvent.deleteController()
     * Controller używa Repository zamiast wywoływać metody bezpośrednio na Model.
     *
     * @param offerEvent - Wydarzenie oferty do usunięcia
     */
    static async delete(offerEvent: OfferEvent): Promise<void> {
        if (!offerEvent.id) throw new Error('No offerEvent id');
        const instance = this.getInstance();
        await instance.repository.delete(offerEvent);
    }

    /**
     * Wysyła mail z ofertą
     *
     * REFAKTORING: Orkiestracja wywołania OfferEvent.sendMailWithOffer()
     * Controller decyduje KIEDY wysłać, Model enkapsuluje szczegóły wysyłki.
     *
     * @param auth - OAuth2Client dla Google API
     * @param offerEvent - Wydarzenie zawierające dane o wysyłce
     * @param offer - Oferta do wysłania
     * @param cc - Opcjonalne adresy CC
     */
    static async sendMailWithOffer(
        auth: OAuth2Client,
        offerEvent: OfferEvent,
        offer: OfferData,
        cc?: string[]
    ): Promise<void> {
        await offerEvent.sendMailWithOffer(auth, offer, cc);
    }
}
