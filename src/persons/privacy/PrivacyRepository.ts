import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { PrivacyNotice, PrivacyScope } from './PrivacyNotice';
export default class PrivacyRepository {
    async find(personId: number, scope: PrivacyScope, version: string): Promise<string | null> {
        const rows: any = await ToolsDb.getQueryCallbackAsync(mysql.format(
            "SELECT DATE_FORMAT(AcknowledgedAt, '%Y-%m-%dT%H:%i:%s.000Z') AS AcknowledgedAt FROM PersonPrivacyAcknowledgements WHERE PersonId=? AND Scope=? AND Version=?",
            [personId, scope, version]));
        return rows[0]?.AcknowledgedAt ?? null;
    }
    async findForAdmin(personId: number, scope: PrivacyScope, version: string): Promise<{ version: string; acknowledgedAt: string } | null> {
        const rows: any = await ToolsDb.getQueryCallbackAsync(mysql.format(
            "SELECT Version AS version, DATE_FORMAT(AcknowledgedAt, '%Y-%m-%dT%H:%i:%s.000Z') AS acknowledgedAt FROM PersonPrivacyAcknowledgements WHERE PersonId=? AND Scope=? ORDER BY (Version=?) DESC, AcknowledgedAt DESC, Id DESC LIMIT 1",
            [personId, scope, version]));
        return rows[0] ?? null;
    }
    async insertSnapshot(notice: PrivacyNotice, snapshot: string, hash: string, conn: mysql.PoolConnection): Promise<string> {
        await conn.execute(
            'INSERT INTO PrivacyNoticeSnapshots (Scope, Version, Revision, Content, ContentHash) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE Id=Id',
            [notice.scope, notice.version, notice.revision, snapshot, hash]);
        const [rows]: any = await conn.execute(
            'SELECT ContentHash FROM PrivacyNoticeSnapshots WHERE Scope=? AND Version=? AND Revision=?',
            [notice.scope, notice.version, notice.revision]);
        return rows[0].ContentHash;
    }
    async insertAcknowledgement(personId: number, notice: PrivacyNotice, conn: mysql.PoolConnection): Promise<void> {
        await conn.execute(
            'INSERT INTO PersonPrivacyAcknowledgements (PersonId, Scope, Version, Revision, AcknowledgedAt) VALUES (?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE Id=Id',
            [personId, notice.scope, notice.version, notice.revision]);
    }
}

