import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import Setup from '../../setup/Setup';

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
    | 'CONTRACT_DOCUMENT'
    | 'OFFER_DOCUMENT';

/** Jawne miejsce grafiki podpisu: strona od 1, prostokat w punktach PDF (poczatek: lewy dolny rog). */
export interface GraphicPlacement {
    page: number;
    rect: { x: number; y: number; width: number; height: number };
}

export interface JobRecord {
    id: number;
    tokenHash: string;
    /** Zrodlo plikow: dokladnie jedno z letterId / offerId / contractId jest ustawione (pilnuje tego baza). */
    letterId: number | null;
    offerId: number | null;
    contractId: number | null;
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
    /** Miejsce grafiki wskazane przy zakladaniu zlecenia; null = wyznacza je serwer. */
    graphicPlacement: GraphicPlacement | null;
    preparedPdf: Buffer | null;
    signedAttrsDer: Buffer | null;
    checkCode: string | null;
    pages: number | null;
    signedGdFileId: string | null;
    signedName: string | null;
}

export interface NewJob {
    tokenHash: string;
    letterId: number | null;
    offerId: number | null;
    contractId: number | null;
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
    graphicPlacement: GraphicPlacement | null;
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
    /** Najwyzej jedno z letterId / offerId / contractId (to samo zrodlo co zlecenie). */
    letterId: number | null;
    offerId: number | null;
    contractId: number | null;
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

/** Oferta jako zrodlo plikow do podpisu: foldery spraw typu "Przygotowanie oferty" (powinien byc jeden). */
export interface OfferContext {
    id: number;
    alias: string;
    isOur: boolean;
    makeOfferCaseFolderIds: string[];
}

/** Typ sprawy "Przygotowanie oferty" (CaseTypes.Id); w jej folderze PS tworzy podfolder "Oferta". */
export const MAKE_OFFER_CASE_TYPE_ID = 100;

/** Wiersz rejestru podpisow do plakietki „podpisane” i listy podpisanych plikow pisma albo oferty. */
export interface SignatureRecord {
    id: number;
    letterId: number | null;
    offerId: number | null;
    contractId: number | null;
    sourceType: SignatureSourceType;
    signedGdFileId: string;
    signedName: string;
    method: SignatureMethod;
    certSubjectCn: string;
    signedAt: Date;
}

export interface ContractContext {
    id: number;
    label: string;
    isOur: boolean;
    documentFolderIds: string[];
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
            letterId: row.LetterId ?? null,
            offerId: row.OfferId ?? null,
            contractId: row.ContractId ?? null,
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
            graphicPlacement:
                row.GraphicPage == null
                    ? null
                    : {
                          page: row.GraphicPage,
                          rect: {
                              x: Number(row.GraphicX),
                              y: Number(row.GraphicY),
                              width: Number(row.GraphicWidth),
                              height: Number(row.GraphicHeight),
                          },
                      },
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

    /**
     * Oferta i foldery jej spraw "Przygotowanie oferty": Offers <- Milestones.OfferId <- Cases.
     * Zwraca wszystkie niepuste foldery; ocena "brak" / "wiecej niz jeden" nalezy do kontrolera.
     */
    async getOfferContext(
        offerId: number,
        conn?: mysql.PoolConnection
    ): Promise<OfferContext | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Offers.Id, Offers.Alias, Offers.IsOur, Cases.GdFolderId AS CaseGdFolderId
             FROM Offers
             LEFT JOIN Milestones ON Milestones.OfferId = Offers.Id
             LEFT JOIN Cases ON Cases.MilestoneId = Milestones.Id AND Cases.TypeId = ?
             WHERE Offers.Id = ?`,
            conn,
            [MAKE_OFFER_CASE_TYPE_ID, offerId]
        )) as any[];
        if (rows.length === 0) return undefined;
        return {
            id: rows[0].Id,
            alias: rows[0].Alias ?? '',
            isOur: !!rows[0].IsOur,
            makeOfferCaseFolderIds: rows
                .map((row) => (row.CaseGdFolderId || '').trim())
                .filter((id) => id.length > 0),
        };
    }

    async getContractContext(
        contractId: number,
        conn?: mysql.PoolConnection
    ): Promise<ContractContext | undefined> {
        const { caseTypeIds } = Setup.ContractDocuments;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Contracts.Id, Contracts.Number, OurContractsData.OurId, Cases.GdFolderId AS CaseGdFolderId
             FROM Contracts
             LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
             LEFT JOIN Milestones ON Milestones.ContractId = Contracts.Id
             LEFT JOIN Cases ON Cases.MilestoneId = Milestones.Id AND ${caseTypeIds.length > 0 ? 'Cases.TypeId IN (?)' : '1 = 0'}
             WHERE Contracts.Id = ?`,
            conn,
            caseTypeIds.length > 0 ? [caseTypeIds, contractId] : [contractId]
        )) as any[];
        if (rows.length === 0) return undefined;
        return {
            id: rows[0].Id,
            label: rows[0].OurId ?? rows[0].Number ?? '',
            isOur: rows[0].OurId != null,
            documentFolderIds: [...new Set<string>(rows
                .map((row) => (row.CaseGdFolderId || '').trim())
                .filter((id) => id.length > 0))],
        };
    }

    async insertJob(job: NewJob, conn: mysql.PoolConnection): Promise<number> {
        const result = await ToolsDb.executeSQL(
            `INSERT INTO SigningJobs
                (TokenHash, LetterId, OfferId, ContractId, CreatedByPersonId, Status, MinProgramVersion, CreatedAt, ExpiresAt)
             VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
            [
                job.tokenHash,
                job.letterId,
                job.offerId,
                job.contractId,
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
                (JobId, FileIndex, SourceKind, SourceGdFileId, DisplayName, WithGraphic,
                 GraphicPage, GraphicX, GraphicY, GraphicWidth, GraphicHeight)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                jobId,
                file.fileIndex,
                file.sourceKind,
                file.sourceGdFileId,
                file.displayName,
                file.withGraphic ? 1 : 0,
                file.graphicPlacement?.page ?? null,
                file.graphicPlacement?.rect.x ?? null,
                file.graphicPlacement?.rect.y ?? null,
                file.graphicPlacement?.rect.width ?? null,
                file.graphicPlacement?.rect.height ?? null,
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
               GraphicPage, GraphicX, GraphicY, GraphicWidth, GraphicHeight,
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
                (SourceType, SourceGdFileId, SignedGdFileId, SignedName, LetterId, OfferId, ContractId, Method,
                 CertSubjectCn, CertSerial, CertIssuer, SignerPersonId, JobId, SignedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                signature.sourceType,
                signature.sourceGdFileId,
                signature.signedGdFileId,
                signature.signedName,
                signature.letterId,
                signature.offerId,
                signature.contractId,
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
        return this.listSignaturesBy('LetterId', letterIds, conn);
    }

    /** Podpisy plikow jednej oferty, od najnowszego. */
    async listSignaturesByOfferId(
        offerId: number,
        conn?: mysql.PoolConnection
    ): Promise<SignatureRecord[]> {
        return this.listSignaturesBy('OfferId', [offerId], conn);
    }

    async listSignaturesByContractId(
        contractId: number,
        conn?: mysql.PoolConnection
    ): Promise<SignatureRecord[]> {
        return this.listSignaturesBy('ContractId', [contractId], conn);
    }

    private async listSignaturesBy(
        column: 'LetterId' | 'OfferId' | 'ContractId',
        ids: number[],
        conn?: mysql.PoolConnection
    ): Promise<SignatureRecord[]> {
        if (ids.length === 0) return [];
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, LetterId, OfferId, ContractId, SourceType, SignedGdFileId, SignedName, Method, CertSubjectCn, SignedAt
             FROM DocumentSignatures
             WHERE ${column} IN (?)
             ORDER BY SignedAt DESC, Id DESC`,
            conn,
            [ids]
        )) as any[];
        return rows.map((row) => ({
            id: row.Id,
            letterId: row.LetterId ?? null,
            offerId: row.OfferId ?? null,
            contractId: row.ContractId ?? null,
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
