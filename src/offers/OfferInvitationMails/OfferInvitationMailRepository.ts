import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import OfferInvitationMail from './OfferInvitationMail';
import ToolsDb from '../../tools/ToolsDb';

type MailSearchParams = {
    id?: number;
    uid?: number;
    editorId?: number;
    statuses?: string[];
    searchText?: string;
};

export default class OfferInvitationMailRepository extends BaseRepository<OfferInvitationMail> {
    constructor() {
        super('OfferInvitationMails');
    }

    /**
     * Wyszukuje maile z zaproszeniami do ofert
     * @param orConditions - tablica warunków wyszukiwania połączonych przez OR
     */
    async find(
        orConditions: MailSearchParams[] = []
    ): Promise<OfferInvitationMail[]> {
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

    /**
     * Tworzy warunki AND dla pojedynczej grupy wyszukiwania
     */
    private makeAndConditions(searchParams: MailSearchParams): string {
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

    /**
     * Tworzy warunek wyszukiwania tekstowego
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
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

        return conditions.join(' AND ');
    }

    /**
     * Mapuje wyniki z bazy danych na instancje OfferInvitationMail
     */
    private processOfferInvitationMailsResult(
        result: any[]
    ): OfferInvitationMail[] {
        const newResult: OfferInvitationMail[] = [];

        for (const row of result) {
            const item = new OfferInvitationMail({
                id: row.Id,
                uid: row.Uid,
                editorId: row.EditorId,
                subject: ToolsDb.sqlToString(row.Subject),
                body: ToolsDb.sqlToString(row.Body),
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

    /**
     * Mapuje pojedynczy wiersz z bazy danych na instancję OfferInvitationMail
     * Wymagana implementacja abstrakcyjnej metody z BaseRepository
     */
    protected mapRowToModel(row: any): OfferInvitationMail {
        return new OfferInvitationMail({
            id: row.Id,
            uid: row.Uid,
            editorId: row.EditorId,
            subject: ToolsDb.sqlToString(row.Subject),
            body: ToolsDb.sqlToString(row.Body),
            from: row.From,
            to: row.To,
            date: row.Date,
            flags: row.Flags ? new Set(row.Flags.split(',')) : undefined,
            status: row.Status,
            _lastUpdated: row.LastUpdated,
            _editor: row.PersonName
                ? {
                      name: row.PersonName,
                      surname: row.PersonSurname,
                      email: row.PersonEmail,
                  }
                : undefined,
        });
    }
}
