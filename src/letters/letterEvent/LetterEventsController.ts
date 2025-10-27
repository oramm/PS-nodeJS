import ToolsDb from '../../tools/ToolsDb';
import LetterEvent from './LetterEvent';
import { LetterEventData, OurLetterContractData } from '../../types/types';
import LetterEventRepository, {
    LetterEventSearchParams,
} from './LetterEventRepository';
import Setup from '../../setup/Setup';
import { OAuth2Client } from 'google-auth-library';
import ToolsMail from '../../tools/ToolsMail';

export default class LetterEventsController {
    private static instance: LetterEventsController;
    private repository: LetterEventRepository;

    constructor() {
        this.repository = new LetterEventRepository();
    }

    // Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
    private static getInstance(): LetterEventsController {
        if (!this.instance) {
            this.instance = new LetterEventsController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę zdarzeń listów
     * @param orConditions - warunki wyszukiwania połączone operatorem OR
     * @returns lista zdarzeń (instancje LetterEvent)
     */
    static async find(
        orConditions: LetterEventSearchParams[] = []
    ): Promise<LetterEvent[]> {
        const instance = this.getInstance();
        // Repository już zwraca zmapowane instancje LetterEvent
        return await instance.repository.find(orConditions);
    }

    /**
     * Dodaje nowe zdarzenie listu
     * ORKIESTRACJA: Oblicza versionNumber, wywołuje repository.addInDb()
     * Logika przeniesiona z LetterEvent.addNewController()
     */
    static async addNew(letterEvent: LetterEvent): Promise<void> {
        const instance = this.getInstance();

        try {
            // Pobierz poprzednie wydarzenia tego typu
            const previousEvents = await this.find([
                {
                    letterId: letterEvent.letterId,
                    eventType: Setup.LetterEventType.SENT,
                },
            ]);

            // Oblicz numer wersji
            letterEvent.versionNumber =
                previousEvents.filter(
                    (event) => event.eventType === Setup.LetterEventType.SENT
                ).length + 1;

            console.group('Creating new LetterEvent');
            // Użyj Repository zamiast letterEvent.addInDb()
            await instance.repository.addInDb(letterEvent);
            console.log('LetterEvent added to db');
            console.groupEnd();
        } catch (err) {
            await this.delete(letterEvent);
            throw err;
        }
    }

    /**
     * Edytuje istniejące zdarzenie listu
     */
    static async edit(letterEvent: LetterEvent): Promise<void> {
        try {
            console.group('Editing LetterEvent');
            const instance = this.getInstance();
            await instance.repository.editInDb(letterEvent);
            console.log('LetterEvent edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('LetterEvent edit error');
            throw err;
        }
    }

    /**
     * Usuwa zdarzenie listu
     */
    static async delete(letterEvent: LetterEvent): Promise<void> {
        if (!letterEvent.id) throw new Error('No letterEvent id');
        const instance = this.getInstance();

        await instance.repository.deleteFromDb(letterEvent);
    }

    /**
     * Wysyła email z pismem
     * ORKIESTRACJA: Koordynuje walidację (Model), budowanie contentu (Model) i wysyłanie (I/O)
     *
     * @param letterEvent - zdarzenie listu z danymi do wysłania
     * @param auth - OAuth2Client do wysyłania email
     * @param letter - dane pisma do załączenia
     * @param cc - opcjonalni odbiorcy kopii
     */
    static async sendMailWithLetter(
        letterEvent: LetterEvent,
        auth: OAuth2Client,
        letter: OurLetterContractData,
        cc?: string[]
    ): Promise<void> {
        // 1. Walidacja danych (Model - logika biznesowa)
        letterEvent.validateEmailData();

        // 2. Budowanie contentu email (Model - logika biznesowa)
        const { subject, html } = letterEvent.buildEmailContent(letter);

        // 3. Wysyłanie email (Controller - operacja I/O)
        ToolsMail.sendEmailWithGdAttachments(
            auth,
            letterEvent._gdFilesBasicData!,
            {
                to: ToolsMail.getMailListFromPersons(letterEvent._recipients!),
                cc: [...(cc || []), 'biuro@envi.com.pl'],
                subject,
                html,
                footer: ToolsMail.makeENVIFooter(),
            }
        );

        console.log(`Email sent for letter ${letter.number}`);
    }
}
