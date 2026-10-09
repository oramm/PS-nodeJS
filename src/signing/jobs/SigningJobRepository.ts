import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

export type JobStatus =
    | 'created'
    | 'preparing'
    | 'prepared'
    | 'finalizing'
    | 'done'
    | 'cancelled'
    | 'expired'
    | 'failed';

export const ACTIVE_STATUSES: JobStatus[] = [
    'created',
    'preparing',
    'prepared',
    'finalizing',
];

export type SourceKind = 'LETTER_DOC' | 'DRIVE_FILE';
export type SignatureMethod = 'LOCAL_APP' | 'MANUAL_UPLOAD';
export type SignatureSourceType =
    | 'LETTER'
    | 'LETTER_ATTACHMENT'
    | 'CONTRACT_DOCUMENT';

export interface JobRecord {
    id: number;
    tokenHash: string;
    letterId: number;
    createdByPersonId: number;
    status: JobStatus;
    minProgramVersion: string;
    createdAt: Date;
    expiresAt: Date;
    preparedAt: Date | null;
    finishedAt: Date | null;
    cancelReason: string | null;
    failureMessage: string | null;
    certSerial: string | null;
    certSubjectCn: string | null;
    certIssuer: string | null;
    /** Lancuch DER, lisc pierwszy; null po zakonczeniu zlecenia. */
    certChain: Buffer[] | null;
    certChangedWarning: boolean;
}

export interface JobFileRecord {
    id: number;
    jobId: number;
    fileIndex: number;
    sourceKind: SourceKind;
    sourceGdFileId: string;
    displayName: string;
    withGraphic: boolean;
    preparedPdf: Buffer | null;
    signedAttrsDer: Buffer | null;
    checkCode: string | null;
    pages: number | null;
    signedGdFileId: string | null;
    signedName: string | null;
}

export interface NewJob {
    tokenHash: string;
    letterId: number;
    createdByPersonId: number;
    minProgramVersion: string;
    createdAt: Date;
    expiresAt: Date;
}

export interface NewJobFile {
    fileIndex: number;
    sourceKind: SourceKind;
    sourceGdFileId: string;
    displayName: string;
    withGraphic: boolean;
}

/** Pola zlecenia, ktore wolno ustawic razem z przejsciem stanu. */
export interface JobUpdate {
    preparedAt?: Date;
    finishedAt?: Date;
    cancelReason?: string | null;
    failureMessage?: string | null;
    certSerial?: string | null;
    certSubjectCn?: string | null;
    certIssuer?: string | null;
    certChain?: Buffer[] | null;
    certChangedWarning?: boolean;
}

export interface NewSignature {
    sourceType: SignatureSourceType;
    sourceGdFileId: string | null;
    signedGdFileId: string;
    signedName: string;
    letterId: number | null;
    method: SignatureMethod;
    certSubjectCn: string;
    certSerial: string;
    certIssuer: string;
    signerPersonId: number;
    jobId: number | null;
    signedAt: Date;
}

export interface LetterContext {
    id: number;
    number: string | null;
    isOur: boolean;
    gdDocumentId: string | null;
    gdFolderId: string | null;
}

/** Wiersz rejestru podpisow do plakietki „podpisane” i listy podpisanych plikow pisma. */
export interface SignatureRecord {
    id: number;
    letterId: number;
    sourceType: SignatureSourceType;
    signedGdFileId: string;
    signedName: string;
    method: SignatureMethod;
    certSubjectCn: string;
    signedAt: Date;
}

export interface PersonCertificateRecord {
    personId: number;
    certSerial: string;
    certIssuerSha256: string;
}

const JOB_UPDATE_COLUMNS: Record<keyof JobUpdate, string> = {
    preparedAt: 'PreparedAt',
    finishedAt: 'FinishedAt',
    cancelReason: 'CancelReason',
    failureMessage: 'FailureMessage',
    certSerial: 'CertSerial',
    certSubjectCn: 'CertSubjectCn',
    certIssuer: 'CertIssuer',
    certChain: 'CertChainJson',
    certChangedWarning: 'CertChangedWarning',
};

function encodeChain(chain: Buffer[] | null): string | null {
    return chain ? JSON.stringify(chain.map((c) => c.toString('base64'))) : null;
}

function decodeChain(json: string | null): Buffer[] | null {
    if (!json) return null;
    return (JSON.parse(json) as string[]).map((b) => Buffer.from(b, 'base64'));
}

/**
 * Tylko SQL, bez regul biznesowych (te siedza w SigningJobsController). Transakcja nalezy do
 * kontrolera: repozytorium dostaje gotowe polaczenie.
 */
export default class SigningJobRepository {
    private static mapJob(row: any): JobRecord {
        return {
            id: row.Id,
            tokenHash: row.TokenHash,
            letterId: row.LetterId,
            createdByPersonId: row.CreatedByPersonId,
            status: row.Status,
            minProgramVersion: row.MinProgramVersion,
            createdAt: row.CreatedAt,
            expiresAt: row.ExpiresAt,
            preparedAt: row.PreparedAt ?? null,
            finishedAt: row.FinishedAt ?? null,
            cancelReason: row.CancelReason ?? null,
            failureMessage: row.FailureMessage ?? null,
            certSerial: row.CertSerial ?? null,
            certSubjectCn: row.CertSubjectCn ?? null,
            certIssuer: row.CertIssuer ?? null,
            certChain: decodeChain(row.CertChainJson ?? null),
            certChangedWarning: !!row.CertChangedWarning,
        };
    }

    private static mapFile(row: any): JobFileRecord {
        return {
            id: row.Id,
            jobId: row.JobId,
            fileIndex: row.FileIndex,
            sourceKind: row.SourceKind,
            sourceGdFileId: row.SourceGdFileId,
            displayName: row.DisplayName,
            withGraphic: !!row.WithGraphic,
            preparedPdf: row.PreparedPdf ?? null,
            signedAttrsDer: row.SignedAttrsDer ?? null,
            checkCode: row.CheckCode ?? null,
            pages: row.Pages ?? null,
            signedGdFileId: row.SignedGdFileId ?? null,
            signedName: row.SignedName ?? null,
        };
    }

    async getLetterContext(
        letterId: number,
        conn?: mysql.PoolConnection
    ): Promise<LetterContext | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, Number, IsOur, GdDocumentId, GdFolderId FROM Letters WHERE Id = ?`,
            conn,
            [letterId]
        )) as any[];
        const row = rows[0];
        if (!row) return undefined;
        return {
            id: row.Id,
            number: row.Number ?? null,
            isOur: !!row.IsOur,
            gdDocumentId: (row.GdDocumentId || '').trim() || null,
            gdFolderId: (row.GdFolderId || '').trim() || null,
        };
    }

    async insertJob(job: NewJob, conn: mysql.PoolConnection): Promise<number> {
        const result = await ToolsDb.executeSQL(
            `INSERT INTO SigningJobs
                (TokenHash, LetterId, CreatedByPersonId, Status, MinProgramVersion, CreatedAt, ExpiresAt)
             VALUES (?, ?, ?, 'created', ?, ?, ?)`,
            [
                job.tokenHash,
                job.letterId,
                job.createdByPersonId,
                job.minProgramVersion,
                job.createdAt,
                job.expiresAt,
            ],
            conn
        );
        return result.insertId;
    }

    async insertFile(
        jobId: number,
        file: NewJobFile,
        conn: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            `INSERT INTO SigningJobFiles
                (JobId, FileIndex, SourceKind, SourceGdFileId, DisplayName, WithGraphic)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                jobId,
                file.fileIndex,
                file.sourceKind,
                file.sourceGdFileId,
                file.displayName,
                file.withGraphic ? 1 : 0,
            ],
            conn
        );
    }

    async findJobById(
        id: number,
        conn?: mysql.PoolConnection
    ): Promise<JobRecord | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT * FROM SigningJobs WHERE Id = ?`,
            conn,
            [id]
        )) as any[];
        return rows[0] ? SigningJobRepository.mapJob(rows[0]) : undefined;
    }

    async findJobByTokenHash(
        tokenHash: string,
        conn?: mysql.PoolConnection
    ): Promise<JobRecord | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT * FROM SigningJobs WHERE TokenHash = ?`,
            conn,
            [tokenHash]
        )) as any[];
        return rows[0] ? SigningJobRepository.mapJob(rows[0]) : undefined;
    }

    async listFiles(
        jobId: number,
        withBlobs: boolean,
        conn?: mysql.PoolConnection
    ): Promise<JobFileRecord[]> {
        const columns = withBlobs
            ? '*'
            : `Id, JobId, FileIndex, SourceKind, SourceGdFileId, DisplayName, WithGraphic,
               CheckCode, Pages, SignedGdFileId, SignedName`;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT ${columns} FROM SigningJobFiles WHERE JobId = ? ORDER BY FileIndex`,
            conn,
            [jobId]
        )) as any[];
        return rows.map(SigningJobRepository.mapFile);
    }

    /** Jeden plik z zamrozonym PDF (podglad). */
    async findFile(
        jobId: number,
        fileIndex: number,
        conn?: mysql.PoolConnection
    ): Promise<JobFileRecord | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT * FROM SigningJobFiles WHERE JobId = ? AND FileIndex = ?`,
            conn,
            [jobId, fileIndex]
        )) as any[];
        return rows[0] ? SigningJobRepository.mapFile(rows[0]) : undefined;
    }

    /**
     * Atomowe przejscie stanu: UPDATE ... WHERE Status IN (from). Zwraca true tylko dla JEDNEGO
     * wywolujacego - to jest mechanizm jednorazowosci tokenu przy rownoleglych zadaniach.
     */
    async transition(
        jobId: number,
        from: JobStatus[],
        to: JobStatus,
        update: JobUpdate = {},
        conn?: mysql.PoolConnection
    ): Promise<boolean> {
        const sets = ['Status = ?'];
        const params: any[] = [to];
        for (const key of Object.keys(update) as (keyof JobUpdate)[]) {
            const value = update[key];
            if (value === undefined) continue;
            sets.push(`${JOB_UPDATE_COLUMNS[key]} = ?`);
            if (key === 'certChain') params.push(encodeChain(value as Buffer[] | null));
            else if (key === 'certChangedWarning') params.push(value ? 1 : 0);
            else params.push(value);
        }
        params.push(jobId, ...from);
        const result = await ToolsDb.executeSQL(
            `UPDATE SigningJobs SET ${sets.join(', ')}
             WHERE Id = ? AND Status IN (${from.map(() => '?').join(', ')})`,
            params,
            conn
        );
        return result.affectedRows === 1;
    }

    async saveFilePrepared(
        fileId: number,
        data: {
            preparedPdf: Buffer;
            signedAttrsDer: Buffer;
            checkCode: string;
            pages: number;
        },
        conn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            `UPDATE SigningJobFiles
             SET PreparedPdf = ?, SignedAttrsDer = ?, CheckCode = ?, Pages = ?
             WHERE Id = ?`,
            [data.preparedPdf, data.signedAttrsDer, data.checkCode, data.pages, fileId],
            conn
        );
    }

    async saveFileSigned(
        fileId: number,
        signedGdFileId: string,
        signedName: string,
        conn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            `UPDATE SigningJobFiles SET SignedGdFileId = ?, SignedName = ? WHERE Id = ?`,
            [signedGdFileId, signedName, fileId],
            conn
        );
    }

    /** Czysci tresc zamrozona w bazie i lancuch certyfikatow (po zakonczeniu zlecenia). */
    async clearSensitive(
        jobId: number,
        conn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            `UPDATE SigningJobFiles SET PreparedPdf = NULL, SignedAttrsDer = NULL WHERE JobId = ?`,
            [jobId],
            conn
        );
        await ToolsDb.executeSQL(
            `UPDATE SigningJobs SET CertChainJson = NULL WHERE Id = ?`,
            [jobId],
            conn
        );
    }

    /**
     * Wygasza zlecenia po terminie, ktorych nikt juz nie odpytuje, i zwalnia ich zamrozone PDF-y.
     * Wolane oportunistycznie przy zakladaniu nowego zlecenia - bez osobnego crona.
     * Stan 'finalizing' nie jest ruszany (trwa zapis na Dysk); gdy proces padl w jego trakcie,
     * zlecenie zostaje do recznej oceny z pelnym sladem w tabeli.
     */
    async expireOverdue(now: Date, conn?: mysql.PoolConnection): Promise<number> {
        const result = await ToolsDb.executeSQL(
            `UPDATE SigningJobs SET Status = 'expired', FinishedAt = ?
             WHERE Status IN ('created', 'preparing', 'prepared') AND ExpiresAt < ?`,
            [now, now],
            conn
        );
        await ToolsDb.executeSQL(
            `UPDATE SigningJobFiles f JOIN SigningJobs j ON j.Id = f.JobId
             SET f.PreparedPdf = NULL, f.SignedAttrsDer = NULL
             WHERE j.Status IN ('expired', 'cancelled', 'failed', 'done')
               AND (f.PreparedPdf IS NOT NULL OR f.SignedAttrsDer IS NOT NULL)`,
            [],
            conn
        );
        await ToolsDb.executeSQL(
            `UPDATE SigningJobs SET CertChainJson = NULL
             WHERE Status IN ('expired', 'cancelled', 'failed', 'done') AND CertChainJson IS NOT NULL`,
            [],
            conn
        );
        return result.affectedRows;
    }

    async insertSignature(
        signature: NewSignature,
        conn: mysql.PoolConnection
    ): Promise<number> {
        const result = await ToolsDb.executeSQL(
            `INSERT INTO DocumentSignatures
                (SourceType, SourceGdFileId, SignedGdFileId, SignedName, LetterId, Method,
                 CertSubjectCn, CertSerial, CertIssuer, SignerPersonId, JobId, SignedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                signature.sourceType,
                signature.sourceGdFileId,
                signature.signedGdFileId,
                signature.signedName,
                signature.letterId,
                signature.method,
                signature.certSubjectCn,
                signature.certSerial,
                signature.certIssuer,
                signature.signerPersonId,
                signature.jobId,
                signature.signedAt,
            ],
            conn
        );
        return result.insertId;
    }

    /**
     * Podpisy wskazanych pism, od najnowszego. Jedno zapytanie na cala liste pism (bez N+1);
     * wolajacy ogranicza liczbe identyfikatorow.
     */
    async listSignaturesByLetterIds(
        letterIds: number[],
        conn?: mysql.PoolConnection
    ): Promise<SignatureRecord[]> {
        if (letterIds.length === 0) return [];
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, LetterId, SourceType, SignedGdFileId, SignedName, Method, CertSubjectCn, SignedAt
             FROM DocumentSignatures
             WHERE LetterId IN (?)
             ORDER BY SignedAt DESC, Id DESC`,
            conn,
            [letterIds]
        )) as any[];
        return rows.map((row) => ({
            id: row.Id,
            letterId: row.LetterId,
            sourceType: row.SourceType,
            signedGdFileId: row.SignedGdFileId,
            signedName: row.SignedName,
            method: row.Method,
            certSubjectCn: row.CertSubjectCn,
            signedAt: new Date(row.SignedAt),
        }));
    }

    async findPersonCertificate(
        personId: number,
        conn?: mysql.PoolConnection
    ): Promise<PersonCertificateRecord | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT PersonId, CertSerial, CertIssuerSha256 FROM PersonSigningCertificates WHERE PersonId = ?`,
            conn,
            [personId]
        )) as any[];
        const row = rows[0];
        return row
            ? {
                  personId: row.PersonId,
                  certSerial: row.CertSerial,
                  certIssuerSha256: row.CertIssuerSha256,
              }
            : undefined;
    }

    /** INSERT IGNORE: rownolegle pierwsze zlecenia nie wywracaja sie na kluczu glownym. */
    async rememberPersonCertificate(
        data: {
            personId: number;
            certSerial: string;
            certIssuerSha256: string;
            certSubjectCn: string;
            firstJobId: number | null;
        },
        conn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            `INSERT IGNORE INTO PersonSigningCertificates
                (PersonId, CertSerial, CertIssuerSha256, CertSubjectCn, FirstJobId)
             VALUES (?, ?, ?, ?, ?)`,
            [
                data.personId,
                data.certSerial,
                data.certIssuerSha256,
                data.certSubjectCn,
                data.firstJobId,
            ],
            conn
        );
    }
}
