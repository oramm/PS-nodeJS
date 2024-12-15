import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import OfferInvitationMail from './OfferInvitationMail';
import { MailData } from '../../types/types';

type MailSearchParams = {
    id?: number;
    uid?: number;
    editorId?: number;
    statuses?: string[];
    searchText?: string;
};

export default class OfferInvitationMailsController {
    static async getOfferInvitationMailsList(
        orConditions: MailSearchParams[] = []
    ) {
        const sql = `SELECT OfferInvitationMails.Id,
            OfferInvitationMails.Uid,
            OfferInvitationMails.EditorId,
            OfferInvitationMails.Subject,
            OfferInvitationMails.Body,
            OfferInvitationMails.From,
            OfferInvitationMails.To,
            OfferInvitationMails.Date,
            OfferInvitationMails.Flags,
            OfferInvitationMails.Status,
            OfferInvitationMails.LastUpdated,
            Persons.Name as PersonName,
            Persons.Surname as PersonSurname,
            Persons.Email as PersonEmail
        FROM OfferInvitationMails
        JOIN Persons ON OfferInvitationMails.EditorId = Persons.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY OfferInvitationMails.Id ASC`;
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processOfferInvitationMailsResult(result);
    }

    static makeAndConditions(searchParams: MailSearchParams) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        if (searchParams.uid) {
            conditions.push(
                mysql.format(`OfferInvitationMails.Uid = ?`, [searchParams.uid])
            );
        }

        if (searchParams.statuses?.length) {
            conditions.push(
                ToolsDb.makeOrConditionFromValueOrArray(
                    searchParams.statuses,
                    'OfferInvitationMails',
                    'Status'
                )
            );
        }

        if (searchParams.editorId) {
            conditions.push(
                mysql.format(`OfferInvitationMails.EditorId = ?`, [
                    searchParams.editorId,
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
                `(OfferInvitationMails.Subject LIKE ? OR OfferInvitationMails.Body LIKE ? OR OfferInvitationMails.From LIKE ? OR OfferInvitationMails.To LIKE ? OR OfferInvitationMails.Flags LIKE ? OR OfferInvitationMails.Date LIKE ? OR OfferInvitationMails.LastUpdated LIKE ?)`,
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static processOfferInvitationMailsResult(result: any[]) {
        let newResult: MailData[] = [];

        for (const row of result) {
            const item = new OfferInvitationMail({
                id: row.Id,
                uid: row.Uid,
                editorId: row.EditorId,
                subject: row.Subject,
                body: row.Body,
                from: row.From,
                to: row.To,
                date: row.Date,
                flags: row.Flags ? new Set(row.Flags.split(',')) : undefined,
                status: row.Status,
                _lastUpdated: row.LastUpdated,
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
