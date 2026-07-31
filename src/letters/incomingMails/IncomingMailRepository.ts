import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import IncomingMail from './IncomingMail';

export type IncomingMailSearchParams = {
    id?: number;
    messageId?: string;
    account?: string;
};

export default class IncomingMailRepository extends BaseRepository<IncomingMail> {
    constructor() {
        super('IncomingMails');
    }

    async find(
        orConditions: IncomingMailSearchParams[] = []
    ): Promise<IncomingMail[]> {
        const sql = `SELECT IncomingMails.Id,
            IncomingMails.MessageId,
            IncomingMails.Account,
            IncomingMails.Subject,
            IncomingMails.Body,
            IncomingMails.\`From\`,
            IncomingMails.\`To\`,
            IncomingMails.Date,
            IncomingMails.EditorId,
            IncomingMails.LastUpdated,
            (SELECT COUNT(*) FROM Letters WHERE Letters.IncomingMailId = IncomingMails.Id) AS LettersCount
        FROM IncomingMails
        WHERE ${this.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY IncomingMails.Id ASC`;

        const result = await this.executeQuery(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: IncomingMailSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.id)
            conditions.push(
                mysql.format('IncomingMails.Id = ?', [searchParams.id])
            );

        if (searchParams.messageId)
            conditions.push(
                mysql.format('IncomingMails.MessageId = ?', [
                    searchParams.messageId,
                ])
            );

        if (searchParams.account)
            conditions.push(
                mysql.format('IncomingMails.Account = ?', [
                    searchParams.account,
                ])
            );

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    protected mapRowToModel(row: any): IncomingMail {
        return new IncomingMail({
            id: row.Id,
            messageId: row.MessageId,
            account: row.Account,
            subject: ToolsDb.sqlToString(row.Subject),
            body: ToolsDb.sqlToString(row.Body),
            from: row.From,
            to: row.To,
            date: row.Date,
            editorId: row.EditorId,
            _lastUpdated: row.LastUpdated,
            _lettersCount: Number(row.LettersCount ?? 0),
        });
    }
}
