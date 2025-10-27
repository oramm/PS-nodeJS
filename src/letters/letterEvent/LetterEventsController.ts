import ToolsDb from '../../tools/ToolsDb';
import LetterEvent from './LetterEvent';
import { LetterEventData } from '../../types/types';
import LetterEventRepository, {
    LetterEventSearchParams,
} from './LetterEventRepository';
import Setup from '../../setup/Setup';

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
        const rawResult = await instance.repository.find(orConditions);
        return this.processLetterEventsResult(rawResult);
    }

    /**
     * Dodaje nowe zdarzenie listu
     * Logika przeniesiona z LetterEvent.addNewController()
     */
    static async addNew(letterEvent: LetterEvent): Promise<void> {
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
            await letterEvent.addInDb();
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
            await letterEvent.editInDb();
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
        await letterEvent.deleteFromDb();
    }

    /**
     * Przetwarza surowe dane z bazy i tworzy instancje LetterEvent
     */
    private static processLetterEventsResult(result: any[]): LetterEvent[] {
        let newResult: LetterEvent[] = [];

        for (const row of result) {
            const item = new LetterEvent({
                id: row.Id,
                letterId: row.LetterId,
                editorId: row.EditorId,
                eventType: row.EventType,
                _lastUpdated: row.LastUpdated,
                comment: ToolsDb.sqlToString(row.Comment),
                additionalMessage: ToolsDb.sqlToString(row.AdditionalMessage),
                versionNumber: row.VersionNumber,
                gdFilesJSON: row.GdFilesJSON,
                recipientsJSON: row.RecipientsJSON,
                _editor: {
                    name: row.PersonName,
                    surname: row.PersonSurname,
                    email: row.PersonEmail,
                },
            });

            newResult.push(item);
        }
        return newResult;
    }
}
