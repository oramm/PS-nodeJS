import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { LetterEventData } from '../../types/types';

type LetterEventSearchParams = {
    id?: number;
    letterId?: number;
    editorId?: number;
    eventType?: string;
    searchText?: string;
};

export default class LetterEventRepository {
    /**
     * Pobiera listę zdarzeń listów z bazy danych
     * @param orConditions - warunki wyszukiwania połączone operatorem OR
     * @returns surowe dane z bazy danych
     */
    async find(orConditions: LetterEventSearchParams[] = []): Promise<any[]> {
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

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result;
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
}

export type { LetterEventSearchParams };
