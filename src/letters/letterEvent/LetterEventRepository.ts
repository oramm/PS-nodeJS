import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { LetterEventData } from '../../types/types';
import LetterEvent from './LetterEvent';
import { PoolConnection } from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';

type LetterEventSearchParams = {
    id?: number;
    letterId?: number;
    editorId?: number;
    eventType?: string;
    searchText?: string;
};

export default class LetterEventRepository extends BaseRepository<LetterEvent> {
    constructor() {
        super('LetterEvents');
    }

    /**
     * Mapuje surowy wiersz z bazy danych na instancję LetterEvent
     * Implementacja wymaganej metody abstrakcyjnej z BaseRepository
     */
    protected mapRowToModel(row: any): LetterEvent {
        return new LetterEvent({
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
    }

    /**
     * Pobiera listę zdarzeń listów z bazy danych
     * @param orConditions - warunki wyszukiwania połączone operatorem OR
     * @returns lista instancji LetterEvent
     */
    async find(
        orConditions: LetterEventSearchParams[] = []
    ): Promise<LetterEvent[]> {
        const sql = `SELECT LetterEvents.Id,
            LetterEvents.LetterId,
            LetterEvents.EditorId,
            LetterEvents.EventType,
            LetterEvents.LastUpdated,
            LetterEvents.Comment,
            LetterEvents.AdditionalMessage,
            LetterEvents.VersionNumber,
            LetterEvents.GdFilesJSON,
            LetterEvents.RecipientsJSON,
            Letters.Id as LetterId,
            Persons.Name as PersonName,
            Persons.Surname as PersonSurname,
            Persons.Email as PersonEmail
        FROM LetterEvents
        JOIN Letters ON LetterEvents.LetterId = Letters.Id
        JOIN Persons ON LetterEvents.EditorId = Persons.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY LetterEvents.Id ASC`;

        const rawResult: any[] = <any[]>(
            await ToolsDb.getQueryCallbackAsync(sql)
        );

        // Mapuj surowe dane na instancje LetterEvent
        return rawResult.map((row) => this.mapRowToModel(row));
    }

    /**
     * Tworzy warunki AND dla pojedynczej grupy parametrów wyszukiwania
     */
    private makeAndConditions(searchParams: LetterEventSearchParams): string {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        if (searchParams.letterId) {
            conditions.push(
                mysql.format(`LetterEvents.LetterId = ?`, [
                    searchParams.letterId,
                ])
            );
        }

        if (searchParams.editorId) {
            conditions.push(
                mysql.format(`LetterEvents.EditorId = ?`, [
                    searchParams.editorId,
                ])
            );
        }

        if (searchParams.eventType) {
            conditions.push(
                mysql.format(`LetterEvents.EventType = ?`, [
                    searchParams.eventType,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    /**
     * Tworzy warunek wyszukiwania po tekście
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(LetterEvents.Comment LIKE ? OR LetterEvents.AdditionalMessage LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    /**
     * Dodaje LetterEvent do bazy danych
     * ORKIESTRACJA: Serializuje JSON przed zapisem
     * Logika przeniesiona z LetterEvent.addInDb()
     *
     * @param letterEvent - instancja LetterEvent do dodania
     * @param externalConn - opcjonalne połączenie (dla transakcji)
     * @param isPartOfTransaction - czy operacja jest częścią transakcji
     */
    async addInDb(
        letterEvent: LetterEvent,
        externalConn?: PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<void> {
        // Serializacja obiektów do JSON przed zapisem do bazy
        letterEvent.gdFilesJSON = JSON.stringify(letterEvent._gdFilesBasicData);
        letterEvent.recipientsJSON = JSON.stringify(letterEvent._recipients);

        // Zapis do bazy danych
        await ToolsDb.addInDb(
            'LetterEvents',
            letterEvent,
            externalConn,
            isPartOfTransaction
        );
    }
}

export type { LetterEventSearchParams };
