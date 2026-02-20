import crypto from 'crypto';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'CLOSED' | 'EXPIRED';
export type SubmissionItemType = 'EXPERIENCE' | 'EDUCATION' | 'SKILL';
export type SubmissionItemStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export type SubmissionLinkRecord = {
    id: number;
    personId: number;
    tokenHash: string;
    expiresAt: string;
    revokedAt?: string;
};

export type SubmissionRecord = {
    id: number;
    linkId: number;
    personId: number;
    email?: string;
    status: SubmissionStatus;
    lastLinkRecipientEmail?: string;
    lastLinkEventAt?: string;
    lastLinkEventType?: string;
    lastLinkEventByPersonId?: number;
    lastActiveLinkUrl?: string;
    lastActiveLinkExpiresAt?: string;
    submittedAt?: string;
    closedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export type SubmissionItemRecord = {
    id: number;
    submissionId: number;
    itemType: SubmissionItemType;
    itemStatus: SubmissionItemStatus;
    payload: any;
    acceptedTargetId?: number;
    reviewedByPersonId?: number;
    reviewedAt?: string;
    reviewComment?: string;
    createdAt: string;
    updatedAt: string;
};

export type SubmissionSessionRecord = {
    id: number;
    submissionId: number;
    email: string;
    tokenHash: string;
    expiresAt: string;
};

export default class PublicProfileSubmissionRepository {
    static hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    static generateToken(byteLength = 32): string {
        return crypto.randomBytes(byteLength).toString('hex');
    }

    static generateCode(): string {
        const code = Math.floor(100000 + Math.random() * 900000);
        return String(code);
    }

    async revokeActiveLinksForPerson(
        personId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissionLinks
             SET RevokedAt = UTC_TIMESTAMP()
             WHERE PersonId = ?
               AND RevokedAt IS NULL
               AND ExpiresAt > UTC_TIMESTAMP()`,
            [personId],
        );
    }

    async createLink(
        params: {
            personId: number;
            tokenHash: string;
            expiresAt: string;
            createdByPersonId?: number;
        },
        conn: mysql.PoolConnection,
    ): Promise<number> {
        const [result]: any = await conn.execute(
            `INSERT INTO PublicProfileSubmissionLinks
             (PersonId, TokenHash, ExpiresAt, CreatedByPersonId)
             VALUES (?, ?, ?, ?)`,
            [
                params.personId,
                params.tokenHash,
                params.expiresAt,
                params.createdByPersonId ?? null,
            ],
        );
        return Number(result.insertId);
    }

    async createSubmission(
        params: {
            linkId: number;
            personId: number;
            status?: SubmissionStatus;
        },
        conn: mysql.PoolConnection,
    ): Promise<number> {
        const [result]: any = await conn.execute(
            `INSERT INTO PublicProfileSubmissions (LinkId, PersonId, Status)
             VALUES (?, ?, ?)`,
            [params.linkId, params.personId, params.status ?? 'DRAFT'],
        );
        return Number(result.insertId);
    }

    async findLatestActiveSubmissionForPerson(
        personId: number,
        conn: mysql.PoolConnection,
    ): Promise<SubmissionRecord | undefined> {
        const [rows] = await conn.query<any[]>(
            `SELECT Id, LinkId, PersonId, Email, Status,
                    LastLinkRecipientEmail, LastLinkEventAt, LastLinkEventType, LastLinkEventByPersonId,
                    LastActiveLinkUrl, LastActiveLinkExpiresAt,
                    SubmittedAt, ClosedAt, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissions
             WHERE PersonId = ?
               AND Status IN ('DRAFT', 'SUBMITTED')
             ORDER BY UpdatedAt DESC, Id DESC
             LIMIT 1`,
            [personId],
        );
        if (!rows[0]) return undefined;
        return this.mapSubmissionRow(rows[0]);
    }

    async reassignSubmissionLink(params: {
        submissionId: number;
        linkId: number;
        conn: mysql.PoolConnection;
    }): Promise<void> {
        await params.conn.execute(
            `UPDATE PublicProfileSubmissions
             SET LinkId = ?,
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [params.linkId, params.submissionId],
        );
    }

    async getDefaultRecipientEmailForPerson(
        personId: number,
    ): Promise<string | undefined> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT NULLIF(TRIM(Email), '') AS Email,
                    NULLIF(TRIM(SystemEmail), '') AS SystemEmail
             FROM Persons
             WHERE Id = ?
             LIMIT 1`,
            undefined,
            [personId],
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return row.Email ?? row.SystemEmail ?? undefined;
    }

    async findLinkByTokenHash(
        tokenHash: string,
    ): Promise<SubmissionLinkRecord | undefined> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, PersonId, TokenHash, ExpiresAt, RevokedAt
             FROM PublicProfileSubmissionLinks
             WHERE TokenHash = ?
             LIMIT 1`,
            undefined,
            [tokenHash],
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return {
            id: row.Id,
            personId: row.PersonId,
            tokenHash: row.TokenHash,
            expiresAt: row.ExpiresAt,
            revokedAt: row.RevokedAt ?? undefined,
        };
    }

    async findSubmissionByLinkId(
        linkId: number,
    ): Promise<SubmissionRecord | undefined> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, LinkId, PersonId, Email, Status,
                    LastLinkRecipientEmail, LastLinkEventAt, LastLinkEventType, LastLinkEventByPersonId,
                    LastActiveLinkUrl, LastActiveLinkExpiresAt,
                    SubmittedAt, ClosedAt, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissions
             WHERE LinkId = ?
             LIMIT 1`,
            undefined,
            [linkId],
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return this.mapSubmissionRow(row);
    }

    async findSubmissionById(
        personId: number,
        submissionId: number,
    ): Promise<SubmissionRecord | undefined> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, LinkId, PersonId, Email, Status,
                    LastLinkRecipientEmail, LastLinkEventAt, LastLinkEventType, LastLinkEventByPersonId,
                    LastActiveLinkUrl, LastActiveLinkExpiresAt,
                    SubmittedAt, ClosedAt, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissions
             WHERE Id = ? AND PersonId = ?
             LIMIT 1`,
            undefined,
            [submissionId, personId],
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return this.mapSubmissionRow(row);
    }

    async findSubmissionByIdUnscoped(
        submissionId: number,
    ): Promise<SubmissionRecord | undefined> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, LinkId, PersonId, Email, Status,
                    LastLinkRecipientEmail, LastLinkEventAt, LastLinkEventType, LastLinkEventByPersonId,
                    LastActiveLinkUrl, LastActiveLinkExpiresAt,
                    SubmittedAt, ClosedAt, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissions
             WHERE Id = ?
             LIMIT 1`,
            undefined,
            [submissionId],
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return this.mapSubmissionRow(row);
    }

    async ensureSubmissionForLink(
        linkId: number,
        personId: number,
        conn: mysql.PoolConnection,
    ): Promise<SubmissionRecord> {
        const [rows] = await conn.query<any[]>(
            `SELECT Id, LinkId, PersonId, Email, Status,
                    LastLinkRecipientEmail, LastLinkEventAt, LastLinkEventType, LastLinkEventByPersonId,
                    LastActiveLinkUrl, LastActiveLinkExpiresAt,
                    SubmittedAt, ClosedAt, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissions
             WHERE LinkId = ?
             LIMIT 1`,
            [linkId],
        );
        if (rows.length > 0) return this.mapSubmissionRow(rows[0]);
        const id = await this.createSubmission({ linkId, personId }, conn);
        const [createdRows] = await conn.query<any[]>(
            `SELECT Id, LinkId, PersonId, Email, Status,
                    LastLinkRecipientEmail, LastLinkEventAt, LastLinkEventType, LastLinkEventByPersonId,
                    LastActiveLinkUrl, LastActiveLinkExpiresAt,
                    SubmittedAt, ClosedAt, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissions
             WHERE Id = ?
             LIMIT 1`,
            [id],
        );
        return this.mapSubmissionRow(createdRows[0]);
    }

    async updateSubmissionLastLinkEvent(params: {
        submissionId: number;
        recipientEmail?: string;
        eventType: 'LINK_GENERATED' | 'LINK_SENT' | 'LINK_SEND_FAILED';
        eventByPersonId?: number;
        linkUrl?: string;
        linkExpiresAt?: string;
        conn: mysql.PoolConnection;
    }): Promise<void> {
        await params.conn.execute(
            `UPDATE PublicProfileSubmissions
             SET LastLinkRecipientEmail = ?,
                 LastLinkEventAt = UTC_TIMESTAMP(),
                 LastLinkEventType = ?,
                 LastLinkEventByPersonId = ?,
                 LastActiveLinkUrl = ?,
                 LastActiveLinkExpiresAt = ?,
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [
                params.recipientEmail ?? null,
                params.eventType,
                params.eventByPersonId ?? null,
                params.linkUrl ?? null,
                params.linkExpiresAt ?? null,
                params.submissionId,
            ],
        );
    }

    async updateSubmissionEmail(
        submissionId: number,
        email: string,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissions
             SET Email = ?, UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [email, submissionId],
        );
    }

    async createVerifyChallenge(
        params: {
            submissionId: number;
            email: string;
            codeHash: string;
            expiresAt: string;
            attemptsLeft: number;
        },
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissionVerifyChallenges
             SET ConsumedAt = UTC_TIMESTAMP()
             WHERE SubmissionId = ?
               AND Email = ?
               AND ConsumedAt IS NULL`,
            [params.submissionId, params.email],
        );

        await conn.execute(
            `INSERT INTO PublicProfileSubmissionVerifyChallenges
             (SubmissionId, Email, CodeHash, ExpiresAt, AttemptsLeft)
             VALUES (?, ?, ?, ?, ?)`,
            [
                params.submissionId,
                params.email,
                params.codeHash,
                params.expiresAt,
                params.attemptsLeft,
            ],
        );
    }

    async getActiveVerifyChallenge(
        submissionId: number,
        email: string,
        conn: mysql.PoolConnection,
    ): Promise<any | undefined> {
        const [rows] = await conn.query<any[]>(
            `SELECT Id, SubmissionId, Email, CodeHash, ExpiresAt, AttemptsLeft, ConsumedAt
             FROM PublicProfileSubmissionVerifyChallenges
             WHERE SubmissionId = ?
               AND Email = ?
               AND ConsumedAt IS NULL
             ORDER BY Id DESC
             LIMIT 1`,
            [submissionId, email],
        );
        return rows[0];
    }

    async decrementVerifyAttempts(
        challengeId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissionVerifyChallenges
             SET AttemptsLeft = AttemptsLeft - 1,
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [challengeId],
        );
    }

    async consumeVerifyChallenge(
        challengeId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissionVerifyChallenges
             SET ConsumedAt = UTC_TIMESTAMP(), UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [challengeId],
        );
    }

    async createSubmissionSession(
        params: {
            submissionId: number;
            email: string;
            sessionTokenHash: string;
            expiresAt: string;
        },
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `INSERT INTO PublicProfileSubmissionSessions
             (SubmissionId, Email, SessionTokenHash, ExpiresAt)
             VALUES (?, ?, ?, ?)`,
            [
                params.submissionId,
                params.email,
                params.sessionTokenHash,
                params.expiresAt,
            ],
        );
    }

    async findActiveSessionByHash(
        submissionId: number,
        sessionTokenHash: string,
    ): Promise<SubmissionSessionRecord | undefined> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, SubmissionId, Email, SessionTokenHash, ExpiresAt
             FROM PublicProfileSubmissionSessions
             WHERE SubmissionId = ?
               AND SessionTokenHash = ?
               AND RevokedAt IS NULL
               AND ExpiresAt > UTC_TIMESTAMP()
             LIMIT 1`,
            undefined,
            [submissionId, sessionTokenHash],
        )) as any[];

        const row = rows[0];
        if (!row) return undefined;
        return {
            id: row.Id,
            submissionId: row.SubmissionId,
            email: row.Email,
            tokenHash: row.SessionTokenHash,
            expiresAt: row.ExpiresAt,
        };
    }

    async getSubmissionItems(
        submissionId: number,
    ): Promise<SubmissionItemRecord[]> {
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, SubmissionId, ItemType, ItemStatus, PayloadJson, AcceptedTargetId, ReviewedByPersonId, ReviewedAt, ReviewComment, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissionItems
             WHERE SubmissionId = ?
             ORDER BY Id ASC`,
            undefined,
            [submissionId],
        )) as any[];
        return rows.map((row) => this.mapItemRow(row));
    }

    async deletePendingItemsByType(
        submissionId: number,
        itemType: SubmissionItemType,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `DELETE FROM PublicProfileSubmissionItems
             WHERE SubmissionId = ?
               AND ItemType = ?
               AND ItemStatus IN ('PENDING', 'REJECTED')`,
            [submissionId, itemType],
        );
    }

    async insertSubmissionItem(
        params: {
            submissionId: number;
            itemType: SubmissionItemType;
            payload: any;
            itemStatus?: SubmissionItemStatus;
        },
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `INSERT INTO PublicProfileSubmissionItems
             (SubmissionId, ItemType, ItemStatus, PayloadJson)
             VALUES (?, ?, ?, ?)`,
            [
                params.submissionId,
                params.itemType,
                params.itemStatus ?? 'PENDING',
                JSON.stringify(params.payload ?? {}),
            ],
        );
    }

    async getSubmissionItem(
        submissionId: number,
        itemId: number,
        conn: mysql.PoolConnection,
    ): Promise<SubmissionItemRecord | undefined> {
        const [rows] = await conn.query<any[]>(
            `SELECT Id, SubmissionId, ItemType, ItemStatus, PayloadJson, AcceptedTargetId, ReviewedByPersonId, ReviewedAt, ReviewComment, CreatedAt, UpdatedAt
             FROM PublicProfileSubmissionItems
             WHERE SubmissionId = ? AND Id = ?
             LIMIT 1`,
            [submissionId, itemId],
        );
        const row = rows[0];
        return row ? this.mapItemRow(row) : undefined;
    }

    async markItemAccepted(
        params: {
            itemId: number;
            reviewedByPersonId: number;
            acceptedTargetId?: number;
        },
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissionItems
             SET ItemStatus = 'ACCEPTED',
                 ReviewedByPersonId = ?,
                 AcceptedTargetId = ?,
                 ReviewComment = NULL,
                 ReviewedAt = UTC_TIMESTAMP(),
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [
                params.reviewedByPersonId,
                params.acceptedTargetId ?? null,
                params.itemId,
            ],
        );
    }

    async markItemRejected(
        params: {
            itemId: number;
            reviewedByPersonId: number;
            reviewComment: string;
        },
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissionItems
             SET ItemStatus = 'REJECTED',
                 ReviewedByPersonId = ?,
                 ReviewComment = ?,
                 ReviewedAt = UTC_TIMESTAMP(),
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [params.reviewedByPersonId, params.reviewComment, params.itemId],
        );
    }

    async countPendingItems(
        submissionId: number,
        conn: mysql.PoolConnection,
    ): Promise<number> {
        const [rows] = await conn.query<any[]>(
            `SELECT COUNT(*) AS Cnt
             FROM PublicProfileSubmissionItems
             WHERE SubmissionId = ?
               AND ItemStatus = 'PENDING'`,
            [submissionId],
        );
        return Number(rows[0]?.Cnt ?? 0);
    }

    async countRejectedItems(
        submissionId: number,
        conn: mysql.PoolConnection,
    ): Promise<number> {
        const [rows] = await conn.query<any[]>(
            `SELECT COUNT(*) AS Cnt
             FROM PublicProfileSubmissionItems
             WHERE SubmissionId = ?
               AND ItemStatus = 'REJECTED'`,
            [submissionId],
        );
        return Number(rows[0]?.Cnt ?? 0);
    }

    async markSubmissionSubmitted(
        submissionId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissions
             SET Status = CASE WHEN Status = 'CLOSED' THEN 'CLOSED' ELSE 'SUBMITTED' END,
                 SubmittedAt = COALESCE(SubmittedAt, UTC_TIMESTAMP()),
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [submissionId],
        );
    }

    async markSubmissionClosed(
        submissionId: number,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        await conn.execute(
            `UPDATE PublicProfileSubmissions
             SET Status = 'CLOSED',
                 ClosedAt = COALESCE(ClosedAt, UTC_TIMESTAMP()),
                 UpdatedAt = UTC_TIMESTAMP()
             WHERE Id = ?`,
            [submissionId],
        );
    }

    async searchSubmissionsForPerson(
        personId: number,
        status?: SubmissionStatus,
    ): Promise<SubmissionRecord[]> {
        const where = status
            ? 'WHERE s.PersonId = ? AND s.Status = ?'
            : 'WHERE s.PersonId = ?';
        const params = status ? [personId, status] : [personId];
        const rows: any[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT s.Id, s.LinkId, s.PersonId, s.Email, s.Status,
                    s.LastLinkRecipientEmail, s.LastLinkEventAt, s.LastLinkEventType, s.LastLinkEventByPersonId,
                    s.LastActiveLinkUrl, s.LastActiveLinkExpiresAt,
                    s.SubmittedAt, s.ClosedAt, s.CreatedAt, s.UpdatedAt
             FROM PublicProfileSubmissions s
             ${where}
             ORDER BY
                CASE WHEN s.Status IN ('DRAFT', 'SUBMITTED') THEN 0 ELSE 1 END,
                s.UpdatedAt DESC,
                s.Id DESC
             LIMIT 1`,
            undefined,
            params,
        )) as any[];
        return rows.map((row) => this.mapSubmissionRow(row));
    }

    private mapSubmissionRow(row: any): SubmissionRecord {
        return {
            id: row.Id,
            linkId: row.LinkId,
            personId: row.PersonId,
            email: row.Email ?? undefined,
            status: row.Status,
            lastLinkRecipientEmail: row.LastLinkRecipientEmail ?? undefined,
            lastLinkEventAt: row.LastLinkEventAt ?? undefined,
            lastLinkEventType: row.LastLinkEventType ?? undefined,
            lastLinkEventByPersonId: row.LastLinkEventByPersonId ?? undefined,
            lastActiveLinkUrl: row.LastActiveLinkUrl ?? undefined,
            lastActiveLinkExpiresAt: row.LastActiveLinkExpiresAt ?? undefined,
            submittedAt: row.SubmittedAt ?? undefined,
            closedAt: row.ClosedAt ?? undefined,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
        };
    }

    private mapItemRow(row: any): SubmissionItemRecord {
        let payload: any = undefined;
        if (row.PayloadJson !== null && row.PayloadJson !== undefined) {
            if (typeof row.PayloadJson === 'string') {
                try {
                    payload = JSON.parse(row.PayloadJson);
                } catch {
                    payload = undefined;
                }
            } else {
                payload = row.PayloadJson;
            }
        }
        return {
            id: row.Id,
            submissionId: row.SubmissionId,
            itemType: row.ItemType,
            itemStatus: row.ItemStatus,
            payload,
            acceptedTargetId: row.AcceptedTargetId ?? undefined,
            reviewedByPersonId: row.ReviewedByPersonId ?? undefined,
            reviewedAt: row.ReviewedAt ?? undefined,
            reviewComment: row.ReviewComment ?? undefined,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
        };
    }
}
