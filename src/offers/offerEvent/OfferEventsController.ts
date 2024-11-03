import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import OfferEvent from './OfferEvent';
import { OfferEventData } from '../../types/types';

type OfferEventSearchParams = {
    id?: number;
    offerId?: number;
    editorId?: number;
    eventType?: string;
    searchText?: string;
};

export default class OfferEventsController {
    static async getOfferEventsList(
        orConditions: OfferEventSearchParams[] = []
    ) {
        const sql = `SELECT OfferEvents.Id,
            OfferEvents.OfferId,
            OfferEvents.EditorId,
            OfferEvents.EventType,
            OfferEvents.LastUpdated,
            OfferEvents.Comment,
            OfferEvents.AdditionalMessage,
            OfferEvents.VersionNumber,
            Offers.Id as OfferId,
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

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processOfferEventsResult(result);
    }

    static makeAndConditions(searchParams: OfferEventSearchParams) {
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

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(OfferEvents.Comment LIKE ? OR OfferEvents.AdditionalMessage LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static processOfferEventsResult(result: any[]) {
        let newResult: OfferEventData[] = [];

        for (const row of result) {
            const item = new OfferEvent({
                id: row.Id,
                offerId: row.OfferId,
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
