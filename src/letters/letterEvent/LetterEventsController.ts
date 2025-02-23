import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import LetterEvent from './LetterEvent';
import { LetterEventData } from '../../types/types';

type LetterEventSearchParams = {
    id?: number;
    letterId?: number;
    editorId?: number;
    eventType?: string;
    searchText?: string;
};

export default class LetterEventsController {
    static async getLetterEventsList(
        orConditions: LetterEventSearchParams[] = []
    ) {
        const sql = `SELECT LetterEvents.Id,
            LetterEvents.LetterId,
            LetterEvents.EditorId,
            LetterEvents.EventType,
            LetterEvents.LastUpdated,
            LetterEvents.Comment,
            LetterEvents.AdditionalMessage,
            LetterEvents.VersionNumber,
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
        return this.processLetterEventsResult(result);
    }

    static makeAndConditions(searchParams: LetterEventSearchParams) {
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

    static makeSearchTextCondition(searchText: string | undefined) {
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

    static processLetterEventsResult(result: any[]) {
        let newResult: LetterEventData[] = [];

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
