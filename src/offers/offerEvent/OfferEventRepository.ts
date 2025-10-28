import BaseRepository from '../../repositories/BaseRepository';
import OfferEvent from './OfferEvent';
import ToolsDb from '../../tools/ToolsDb';
import mysql from 'mysql2/promise';

export type OfferEventSearchParams = {
    id?: number;
    offerId?: number;
    editorId?: number;
    eventType?: string;
    searchText?: string;
};

/**
 * Repository dla OfferEvent - warstwa dostępu do danych
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseRepository<OfferEvent>
 * - Odpowiedzialny TYLKO za operacje CRUD i SQL
 * - NIE zawiera logiki biznesowej
 */
export default class OfferEventRepository extends BaseRepository<OfferEvent> {
    constructor() {
        super('OfferEvents');
    }

    /**
     * Dodaje nowy OfferEvent do bazy danych
     *
     * OVERRIDE: Przygotowuje dane (JSON stringify) przed zapisem
     *
     * @param offerEvent - Wydarzenie oferty do dodania
     * @param externalConn - Opcjonalne połączenie (dla transakcji)
     * @param isPartOfTransaction - Czy część większej transakcji
     */
    async addInDb(
        offerEvent: OfferEvent,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<any> {
        // Przygotowanie danych: konwersja obiektów na JSON
        offerEvent.gdFilesJSON = JSON.stringify(offerEvent._gdFilesBasicData);
        offerEvent.recipientsJSON = JSON.stringify(offerEvent._recipients);

        // Wywołanie metody bazowej (ToolsDb.addInDb)
        return await super.addInDb(
            offerEvent,
            externalConn,
            isPartOfTransaction
        );
    }

    /**
     * Aktualizuje OfferEvent w bazie danych
     *
     * OVERRIDE: Przygotowuje dane (JSON stringify) przed zapisem
     *
     * @param offerEvent - Wydarzenie oferty do aktualizacji
     * @param externalConn - Opcjonalne połączenie (dla transakcji)
     * @param isPartOfTransaction - Czy część większej transakcji
     * @param fieldsToUpdate - Opcjonalna lista pól do aktualizacji
     */
    async editInDb(
        offerEvent: OfferEvent,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        fieldsToUpdate?: string[]
    ): Promise<any> {
        // Przygotowanie danych: konwersja obiektów na JSON
        offerEvent.gdFilesJSON = JSON.stringify(offerEvent._gdFilesBasicData);
        offerEvent.recipientsJSON = JSON.stringify(offerEvent._recipients);

        // Wywołanie metody bazowej (ToolsDb.editInDb)
        return await super.editInDb(
            offerEvent,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate
        );
    }

    /**
     * Wyszukuje wydarzenia ofert w bazie danych
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<OfferEvent[]> - Lista znalezionych wydarzeń
     */
    async find(
        orConditions: OfferEventSearchParams[] = []
    ): Promise<OfferEvent[]> {
        const sql = `SELECT OfferEvents.Id,
            OfferEvents.OfferId,
            OfferEvents.EditorId,
            OfferEvents.EventType,
            OfferEvents.LastUpdated,
            OfferEvents.Comment,
            OfferEvents.AdditionalMessage,
            OfferEvents.VersionNumber,
            OfferEvents.GdFilesJSON,
            OfferEvents.RecipientsJSON,
            Offers.Id as OfferId,
            Persons.Id as PersonId,
            Persons.Name as PersonName,
            Persons.Surname as PersonSurname,
            Persons.Email as PersonEmail
        FROM OfferEvents
        JOIN Offers ON OfferEvents.OfferId = Offers.Id
        JOIN Persons ON OfferEvents.EditorId = Persons.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY OfferEvents.Id ASC`;

        const result = await ToolsDb.getQueryCallbackAsync(sql);
        return (result as any[]).map((row) => this.mapRowToModel(row));
    }

    /**
     * Buduje warunki AND dla zapytania SQL
     *
     * @param searchParams - Parametry wyszukiwania
     * @returns string - Warunki SQL
     */
    private makeAndConditions(searchParams: OfferEventSearchParams): string {
        const conditions: string[] = [];

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        if (searchParams.offerId) {
            conditions.push(
                mysql.format(`OfferEvents.OfferId = ?`, [searchParams.offerId])
            );
        }

        if (searchParams.editorId) {
            conditions.push(
                mysql.format(`OfferEvents.EditorId = ?`, [
                    searchParams.editorId,
                ])
            );
        }

        if (searchParams.eventType) {
            conditions.push(
                mysql.format(`OfferEvents.EventType = ?`, [
                    searchParams.eventType,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    /**
     * Buduje warunek wyszukiwania pełnotekstowego
     *
     * @param searchText - Tekst do wyszukania
     * @returns string - Warunek SQL LIKE
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(OfferEvents.Comment LIKE ? OR OfferEvents.AdditionalMessage LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        return conditions.join(' AND ');
    }

    /**
     * Mapuje wiersz z bazy danych na obiekt OfferEvent
     *
     * @param row - Wiersz z bazy danych
     * @returns OfferEvent - Zmapowany obiekt
     */
    protected mapRowToModel(row: any): OfferEvent {
        return new OfferEvent({
            id: row.Id,
            offerId: row.OfferId,
            editorId: row.EditorId,
            eventType: row.EventType,
            _lastUpdated: row.LastUpdated,
            comment: ToolsDb.sqlToString(row.Comment),
            additionalMessage: ToolsDb.sqlToString(row.AdditionalMessage),
            versionNumber: row.VersionNumber,
            gdFilesJSON: row.GdFilesJSON,
            recipientsJSON: row.RecipientsJSON,
            _editor: {
                id: row.PersonId,
                name: row.PersonName,
                surname: row.PersonSurname,
                email: row.PersonEmail,
            },
        });
    }

    /**
     * Usuwa wydarzenie oferty z bazy danych
     *
     * @param offerEvent - Wydarzenie do usunięcia
     */
    async delete(offerEvent: OfferEvent): Promise<void> {
        if (!offerEvent.id) throw new Error('No offerEvent id');

        const sql = `DELETE FROM ${this.tableName} WHERE Id = ?`;
        await ToolsDb.executePreparedStmt(sql, [offerEvent.id], offerEvent);
    }
}
