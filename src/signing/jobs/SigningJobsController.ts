import { createHash, randomBytes } from 'crypto';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import ProjectScopeGuard from '../../persons/projectAssignments/ProjectScopeGuard';
import { ProjectScope } from '../../types/sessionTypes';
import { finalize, prepare, validate } from '../PdfSigning';
import { SigningError } from '../SigningError';
import { SignaturePlacement } from '../SigningTypes';
import { verifySigningCertificate } from './CertificateVerifier';
import { TrustedCa } from './QualifiedCaAllowlist';
import { DriveFileInfo, SigningDrive } from './SigningDrive';
import { SigningJobError } from './SigningJobError';
import SigningJobRepository, {
    ACTIVE_STATUSES,
    JobFileRecord,
    JobRecord,
    JobStatus,
    LetterContext,
    NewJobFile,
    SignatureMethod,
    SignatureRecord,
    SignatureSourceType,
    SourceKind,
} from './SigningJobRepository';
import SigningJobValidator, { CreateJobDto } from './SigningJobValidator';
import {
    FILE_NAME_TIME_ZONE,
    JOB_TTL_MS,
    MAX_PDF_BYTES,
    MIME_GOOGLE_DOC,
    MIME_GOOGLE_FOLDER,
    MIME_GOOGLE_SHEET,
    MIME_PDF,
    MIN_PROGRAM_VERSION,
    PROTOCOL_PREFIX,
    TOKEN_BYTES,
} from './SigningJobsConfig';

type Connection = mysql.PoolConnection;

export interface SigningJobsDeps {
    repository: SigningJobRepository;
    drive: SigningDrive;
    now: () => Date;
    runInTransaction: <T>(callback: (conn: Connection) => Promise<T>) => Promise<T>;
    assertLetterInScope: (letterId: number, scope?: ProjectScope) => Promise<void>;
    /** Tylko testy: inna lista zaufanych CA niz stala produkcyjna. */
    allowlist?: readonly TrustedCa[];
}

export interface SignableFile {
    kind: SourceKind;
    /** Dla LETTER_DOC: id Dokumentu pisma. */
    gdFileId: string;
    name: string;
    mimeType: string;
    withGraphic: boolean;
    graphicLocked: boolean;
}

export interface NotSignableFile {
    gdFileId: string;
    name: string;
    mimeType: string;
    reason: string;
}

export interface SignableFilesResult {
    letterId: number;
    letterNumber: string | null;
    files: SignableFile[];
    notSignable: NotSignableFile[];
}

export interface CreateJobResult {
    jobId: number;
    protocolUrl: string;
    expiresAt: string;
}

export interface JobStatusResult {
    jobId: number;
    letterId: number;
    status: JobStatus;
    expiresAt: string;
    failureMessage: string | null;
    cancelReason: string | null;
    signer: { name: string; serial: string; issuer: string } | null;
    /** true = inny certyfikat niz pierwszy zapamietany dla tej osoby (ostrzezenie, nie blokada). */
    certChangedWarning: boolean;
    files: Array<{
        index: number;
        kind: SourceKind;
        name: string;
        withGraphic: boolean;
        pages: number | null;
        checkCode: string | null;
        previewAvailable: boolean;
        signedGdFileId: string | null;
        signedName: string | null;
        signedUrl: string | null;
    }>;
}

export interface ProgramJobView {
    status: JobStatus;
    files: Array<{ name: string }>;
    minProgramVersion: string;
    expiresAt: string;
}

export interface ProgramPreparedFile {
    name: string;
    pages: number;
    checkCode: string;
    hashToSign: string;
}

export interface ManualUploadResult {
    signedGdFileId: string;
    signedName: string;
    signedUrl: string;
    signerName: string;
    certChangedWarning: boolean;
}

/** Podpisany plik pisma (wpis rejestru) w postaci dla strony PS. */
export interface LetterSignatureView {
    id: number;
    sourceType: SignatureSourceType;
    signedGdFileId: string;
    signedName: string;
    signedUrl: string;
    signerName: string;
    method: SignatureMethod;
    signedAt: string;
}

export interface LetterSignaturesResult {
    letterId: number;
    signatures: LetterSignatureView[];
}

/** Zbiorczo dla listy pism: tylko pisma, ktore maja podpisy, sa w mapie. Najnowszy podpis pierwszy. */
export interface SignatureSummaryResult {
    summary: Record<
        string,
        { count: number; latestSignerName: string; latestSignedAt: string; signatures: LetterSignatureView[] }
    >;
}

// Owner 2026-10-09: short suffix "_pdp" (Szafir uses "_sig").
const SIGNED_SUFFIX = '_pdp';

const SIGNING_ERROR_TEXT: Record<string, string> = {
    INVALID_PDF: 'nie jest poprawnym plikiem PDF',
    ENCRYPTED_PDF: 'jest zaszyfrowany, więc nie da się go podpisać',
    ALREADY_SIGNED: 'ma już podpis - drugiego nie dodajemy',
    INVALID_CERTIFICATE: 'certyfikat z karty nie nadaje się do podpisu',
    UNSUPPORTED_KEY: 'karta ma klucz inny niż RSA, a taki nie jest obsługiwany',
    INVALID_PLACEMENT: 'nie da się ustawić grafiki podpisu',
    PLACEMENT_BLOCKED:
        'nie znalazłem wolnego miejsca na grafikę podpisu (spróbuj bez grafiki)',
    INVALID_PREPARED_PDF: 'przygotowany plik nie pasuje do podpisu',
    SIGNATURE_MISMATCH: 'podpis z karty nie pasuje do pliku i certyfikatu',
    PLACEHOLDER_TOO_SMALL: 'podpis nie mieści się w zarezerwowanym miejscu',
};

const sha256Hex = (value: string): string =>
    createHash('sha256').update(value, 'utf8').digest('hex');

const fail = (
    code: ConstructorParameters<typeof SigningJobError>[0],
    message: string,
    status: number
): never => {
    throw new SigningJobError(code, message, status);
};

function describeSigningError(error: unknown): string {
    if (error instanceof SigningError)
        return SIGNING_ERROR_TEXT[error.code] ?? 'nie udało się go przygotować do podpisu';
    return 'nie udało się go przygotować do podpisu';
}

function stripPdfExtension(name: string): string {
    return name.replace(/\.pdf$/i, '');
}

/** Nazwa pliku wynikowego: `<nazwa>_pdp.pdf`; przy kolizji dodaje znacznik czasu (D-SIG-4). */
export function signedFileName(
    sourceName: string,
    taken: Set<string>,
    now: Date
): string {
    const base = stripPdfExtension(sourceName).replace(/[\\/]/g, '-').trim() || 'dokument';
    const lowerTaken = new Set([...taken].map((n) => n.toLowerCase()));
    const plain = `${base}${SIGNED_SUFFIX}.pdf`;
    if (!lowerTaken.has(plain.toLowerCase())) return plain;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: FILE_NAME_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const stamp = `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
    let candidate = `${base}${SIGNED_SUFFIX}_${stamp}.pdf`;
    let counter = 2;
    while (lowerTaken.has(candidate.toLowerCase())) {
        candidate = `${base}${SIGNED_SUFFIX}_${stamp}_${counter++}.pdf`;
    }
    return candidate;
}

const isSignedName = (name: string): boolean =>
    // signed copies: ours (_pdp), Szafir (_sig), earlier draft naming (_podpisany)
    /_(pdp|sig|podpisany)\b/i.test(name) && /\.pdf$/i.test(name);

const driveUrl = (id: string): string => `https://drive.google.com/file/d/${id}/view`;

/**
 * Zlecenia podpisu pism (SIG-2). Orkiestruje: baze (przez repozytorium), Dysk Google (przez
 * interfejs SigningDrive), biblioteke podpisu (SIG-1) i sprawdzenie certyfikatu. Zarzadza
 * transakcjami. Zasada naczelna: KAZDA odmowa zapada przed jakimkolwiek zapisem na Dysku;
 * zapisy na Dysk to ostatni krok, po przejsciu wszystkich sprawdzen.
 */
export default class SigningJobsController {
    constructor(private readonly deps: SigningJobsDeps) {}

    // ------------------------------------------------------------------ pismo i jego pliki

    private async requireLetter(
        letterId: number,
        scope: ProjectScope | undefined,
        conn?: Connection
    ): Promise<LetterContext & { gdDocumentId: string; gdFolderId: string }> {
        await this.deps.assertLetterInScope(letterId, scope);
        const letter = await this.deps.repository.getLetterContext(letterId, conn);
        if (!letter) return fail('NOT_FOUND', 'Nie znaleziono pisma.', 404);
        if (!letter.isOur)
            return fail('BAD_REQUEST', 'Podpisujemy tylko pisma wychodzące.', 400);
        if (!letter.gdDocumentId || !letter.gdFolderId)
            return fail(
                'BAD_REQUEST',
                'To pismo nie ma dokumentu albo folderu na Dysku Google.',
                400
            );
        return letter as LetterContext & { gdDocumentId: string; gdFolderId: string };
    }

    private async buildSignable(
        letter: LetterContext & { gdDocumentId: string; gdFolderId: string }
    ): Promise<{ files: SignableFile[]; notSignable: NotSignableFile[]; docName: string }> {
        const doc = await this.deps.drive.getFile(letter.gdDocumentId);
        if (!doc || doc.trashed)
            return fail(
                'BAD_REQUEST',
                'Dokument pisma nie istnieje już na Dysku Google.',
                409
            );
        const children = await this.deps.drive.listFolder(letter.gdFolderId);

        const files: SignableFile[] = [
            {
                kind: 'LETTER_DOC',
                gdFileId: doc.id,
                name: doc.name,
                mimeType: doc.mimeType,
                withGraphic: true,
                graphicLocked: true,
            },
        ];
        const notSignable: NotSignableFile[] = [];
        const exportName = `${doc.name}.pdf`.toLowerCase();

        for (const child of children) {
            if (child.id === doc.id) continue;
            if (child.mimeType === MIME_GOOGLE_FOLDER) continue;
            const lower = child.name.toLowerCase();
            // Eksport PDF samego pisma i wczesniejsze podpisane pliki nie sa zalacznikami.
            if (child.mimeType === MIME_PDF && (lower === exportName || isSignedName(child.name)))
                continue;

            if (child.mimeType === MIME_PDF) {
                if (child.size !== undefined && child.size > MAX_PDF_BYTES) {
                    notSignable.push({
                        gdFileId: child.id,
                        name: child.name,
                        mimeType: child.mimeType,
                        reason: `Plik jest za duży (limit ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)} MB).`,
                    });
                    continue;
                }
                files.push(this.asAttachment(child));
            } else if (child.mimeType === MIME_GOOGLE_DOC || child.mimeType === MIME_GOOGLE_SHEET) {
                files.push(this.asAttachment(child));
            } else {
                notSignable.push({
                    gdFileId: child.id,
                    name: child.name,
                    mimeType: child.mimeType,
                    reason:
                        'Ten format nie jest podpisywany w PS. Podpisujemy PDF oraz Dokumenty i Arkusze Google.',
                });
            }
        }
        return { files, notSignable, docName: doc.name };
    }

    private asAttachment(child: DriveFileInfo): SignableFile {
        return {
            kind: 'DRIVE_FILE',
            gdFileId: child.id,
            name: child.name,
            mimeType: child.mimeType,
            withGraphic: false,
            graphicLocked: false,
        };
    }

    async listSignableFiles(
        letterId: number,
        scope?: ProjectScope
    ): Promise<SignableFilesResult> {
        const letter = await this.requireLetter(letterId, scope);
        const { files, notSignable } = await this.buildSignable(letter);
        return { letterId, letterNumber: letter.number, files, notSignable };
    }

    // ------------------------------------------------------------------ podpisane pliki pisma

    private toSignatureView(record: SignatureRecord): LetterSignatureView {
        return {
            id: record.id,
            sourceType: record.sourceType,
            signedGdFileId: record.signedGdFileId,
            signedName: record.signedName,
            signedUrl: driveUrl(record.signedGdFileId),
            signerName: record.certSubjectCn,
            method: record.method,
            signedAt: record.signedAt.toISOString(),
        };
    }

    /** Podpisane pliki jednego pisma (okno podpisu, odnosnik z plakietki). */
    async listLetterSignatures(
        letterId: number,
        scope?: ProjectScope
    ): Promise<LetterSignaturesResult> {
        if (!Number.isInteger(letterId) || letterId <= 0)
            return fail('BAD_REQUEST', 'Nieprawidłowy identyfikator pisma.', 400);
        await this.deps.assertLetterInScope(letterId, scope);
        const records = await this.deps.repository.listSignaturesByLetterIds([letterId]);
        return { letterId, signatures: records.map((r) => this.toSignatureView(r)) };
    }

    /**
     * Podpisy wielu pism jednym zapytaniem - plakietki na liscie pism bez N+1. Role zakresowe i tak
     * nie dochodza do tej trasy (polityka zakresu), ale gdy zakres jest ustawiony, sprawdzamy kazde pismo.
     */
    async summarizeLetterSignatures(
        body: unknown,
        scope?: ProjectScope
    ): Promise<SignatureSummaryResult> {
        const letterIds = SigningJobValidator.parseLetterIds(body);
        if (scope)
            for (const id of letterIds) await this.deps.assertLetterInScope(id, scope);
        const records = await this.deps.repository.listSignaturesByLetterIds(letterIds);
        const summary: SignatureSummaryResult['summary'] = {};
        for (const record of records) {
            const view = this.toSignatureView(record);
            const key = String(record.letterId);
            if (!summary[key])
                summary[key] = {
                    count: 0,
                    latestSignerName: view.signerName,
                    latestSignedAt: view.signedAt,
                    signatures: [],
                };
            summary[key].count++;
            summary[key].signatures.push(view);
        }
        return { summary };
    }

    // ------------------------------------------------------------------ zakladanie zlecenia

    async createJob(
        personId: number,
        body: unknown,
        scope?: ProjectScope
    ): Promise<CreateJobResult> {
        const dto: CreateJobDto = SigningJobValidator.parseCreateJob(body);
        const letter = await this.requireLetter(dto.letterId, scope);
        const { files: signable } = await this.buildSignable(letter);

        const chosen: NewJobFile[] = dto.files.map((requested, fileIndex) => {
            const match =
                requested.kind === 'LETTER_DOC'
                    ? signable.find((f) => f.kind === 'LETTER_DOC')
                    : signable.find(
                          (f) => f.kind === 'DRIVE_FILE' && f.gdFileId === requested.gdFileId
                      );
            if (!match)
                return fail(
                    'BAD_REQUEST',
                    'Wybrany plik nie jest już dostępny do podpisu w folderze tego pisma. Odśwież listę.',
                    409
                );
            return {
                fileIndex,
                sourceKind: match.kind,
                sourceGdFileId: match.gdFileId,
                displayName: match.name,
                // Pismo zawsze z grafika (decyzja ownera); zalaczniki wg wyboru.
                withGraphic: match.kind === 'LETTER_DOC' ? true : requested.withGraphic,
            };
        });

        const token = randomBytes(TOKEN_BYTES).toString('base64url');
        const now = this.deps.now();
        const expiresAt = new Date(now.getTime() + JOB_TTL_MS);

        await this.deps.repository.expireOverdue(now);
        const jobId = await this.deps.runInTransaction(async (conn) => {
            const id = await this.deps.repository.insertJob(
                {
                    tokenHash: sha256Hex(token),
                    letterId: letter.id,
                    createdByPersonId: personId,
                    minProgramVersion: MIN_PROGRAM_VERSION,
                    createdAt: now,
                    expiresAt,
                },
                conn
            );
            for (const file of chosen) await this.deps.repository.insertFile(id, file, conn);
            return id;
        });

        return {
            jobId,
            protocolUrl: `${PROTOCOL_PREFIX}${token}`,
            expiresAt: expiresAt.toISOString(),
        };
    }

    // ------------------------------------------------------------------ trasy sesyjne (PS)

    private async loadOwnJob(jobId: number, personId: number): Promise<JobRecord> {
        const job = Number.isInteger(jobId)
            ? await this.deps.repository.findJobById(jobId)
            : undefined;
        // Nieistniejace i cudze zlecenie wygladaja tak samo (jak w ProjectScopeGuard).
        if (!job || job.createdByPersonId !== personId)
            return fail('FORBIDDEN', 'Brak uprawnień do tego zlecenia.', 403);
        return this.expireIfOverdue(job);
    }

    /** Leniwe wygasanie: zlecenie po terminie przechodzi w 'expired' przy pierwszym dotknieciu. */
    private async expireIfOverdue(job: JobRecord): Promise<JobRecord> {
        const now = this.deps.now();
        if (!ACTIVE_STATUSES.includes(job.status) || job.status === 'finalizing')
            return job;
        if (now.getTime() <= new Date(job.expiresAt).getTime()) return job;
        const won = await this.deps.repository.transition(
            job.id,
            ['created', 'preparing', 'prepared'],
            'expired',
            { finishedAt: now }
        );
        if (won) await this.deps.repository.clearSensitive(job.id);
        const fresh = await this.deps.repository.findJobById(job.id);
        return fresh ?? { ...job, status: 'expired' };
    }

    async getJobStatus(jobId: number, personId: number): Promise<JobStatusResult> {
        const job = await this.loadOwnJob(jobId, personId);
        const files = await this.deps.repository.listFiles(job.id, false);
        return {
            jobId: job.id,
            letterId: job.letterId,
            status: job.status,
            expiresAt: new Date(job.expiresAt).toISOString(),
            failureMessage: job.failureMessage,
            cancelReason: job.cancelReason,
            signer: job.certSubjectCn
                ? {
                      name: job.certSubjectCn,
                      serial: job.certSerial ?? '',
                      issuer: job.certIssuer ?? '',
                  }
                : null,
            certChangedWarning: job.certChangedWarning,
            files: files.map((f) => ({
                index: f.fileIndex,
                kind: f.sourceKind,
                name: f.displayName,
                withGraphic: f.withGraphic,
                pages: f.pages,
                checkCode: f.checkCode,
                previewAvailable:
                    f.checkCode !== null &&
                    (job.status === 'prepared' || job.status === 'finalizing'),
                signedGdFileId: f.signedGdFileId,
                signedName: f.signedName,
                signedUrl: f.signedGdFileId ? driveUrl(f.signedGdFileId) : null,
            })),
        };
    }

    async getPreview(
        jobId: number,
        personId: number,
        fileIndex: number
    ): Promise<{ bytes: Buffer; fileName: string }> {
        const job = await this.loadOwnJob(jobId, personId);
        if (job.status !== 'prepared' && job.status !== 'finalizing')
            return fail(
                'WRONG_STATE',
                'Podgląd jest dostępny dopiero po przygotowaniu plików i do końca podpisywania.',
                409
            );
        const file = await this.deps.repository.findFile(job.id, fileIndex);
        if (!file || !file.preparedPdf)
            return fail('NOT_FOUND', 'Nie ma takiego pliku w zleceniu.', 404);
        return {
            bytes: file.preparedPdf,
            fileName: `${stripPdfExtension(file.displayName)}_podglad.pdf`,
        };
    }

    async cancelOwnJob(
        jobId: number,
        personId: number,
        reason: string | null
    ): Promise<{ status: JobStatus }> {
        const job = await this.loadOwnJob(jobId, personId);
        return this.cancel(job, reason ?? 'Anulowane w PS');
    }

    private async cancel(
        job: JobRecord,
        reason: string
    ): Promise<{ status: JobStatus }> {
        if (job.status === 'cancelled' || job.status === 'expired')
            return { status: job.status };
        const won = await this.deps.repository.transition(
            job.id,
            ['created', 'preparing', 'prepared'],
            'cancelled',
            { cancelReason: reason, finishedAt: this.deps.now() }
        );
        if (!won) {
            const current = await this.deps.repository.findJobById(job.id);
            return fail(
                'WRONG_STATE',
                current?.status === 'done'
                    ? 'Zlecenie zostało już podpisane.'
                    : 'Zlecenia nie można teraz anulować.',
                409
            );
        }
        await this.deps.repository.clearSensitive(job.id);
        return { status: 'cancelled' };
    }

    // ------------------------------------------------------------------ trasy programu (token)

    private async loadJobByToken(token: unknown): Promise<JobRecord> {
        // Nieznany token i token w zlym formacie wygladaja tak samo: nic nie zdradzamy.
        const job = SigningJobValidator.isTokenFormat(token)
            ? await this.deps.repository.findJobByTokenHash(sha256Hex(token))
            : undefined;
        if (!job) return fail('NOT_FOUND', 'Nie znaleziono takiego zlecenia podpisu.', 404);
        return this.expireIfOverdue(job);
    }

    private assertState(job: JobRecord, expected: JobStatus): void {
        if (job.status === expected) return;
        if (job.status === 'expired')
            return fail('EXPIRED', 'Zlecenie wygasło. Zacznij podpisywanie od nowa w PS.', 410);
        if (job.status === 'cancelled')
            return fail('WRONG_STATE', 'Zlecenie zostało anulowane.', 409);
        if (job.status === 'done')
            return fail('WRONG_STATE', 'Zlecenie zostało już podpisane.', 409);
        if (job.status === 'failed')
            return fail(
                'WRONG_STATE',
                job.failureMessage ?? 'Zlecenie zakończyło się błędem.',
                409
            );
        return fail(
            'WRONG_STATE',
            'To zlecenie jest już w użyciu. Zacznij podpisywanie od nowa w PS.',
            409
        );
    }

    async getJobForProgram(token: unknown): Promise<ProgramJobView> {
        const job = await this.loadJobByToken(token);
        const files = await this.deps.repository.listFiles(job.id, false);
        return {
            status: job.status,
            files: files.map((f) => ({ name: f.displayName })),
            minProgramVersion: job.minProgramVersion,
            expiresAt: new Date(job.expiresAt).toISOString(),
        };
    }

    async cancelByProgram(token: unknown, body: unknown): Promise<{ status: JobStatus }> {
        const job = await this.loadJobByToken(token);
        const reason = SigningJobValidator.parseCancelReason(body) ?? 'Anulowane w programie';
        return this.cancel(job, reason);
    }

    /** Oznacza zlecenie jako nieudane (stan koncowy) i zwalnia zamrozone dane. */
    private async failJob(
        job: JobRecord,
        from: JobStatus[],
        message: string
    ): Promise<void> {
        const won = await this.deps.repository.transition(job.id, from, 'failed', {
            failureMessage: message.slice(0, 500),
            finishedAt: this.deps.now(),
        });
        if (won) await this.deps.repository.clearSensitive(job.id);
    }

    /**
     * Krok 2 kontraktu: program przysyla certyfikat. Serwer (1) sprawdza go kryptograficznie,
     * (2) zajmuje zlecenie (created -> preparing, tylko jeden zwyciezca), (3) zamraza tresc:
     * pobiera/eksportuje pliki z Dysku (TYLKO ODCZYT), przygotowuje PDF-y z miejscem na podpis.
     * Odrzucony certyfikat zostawia zlecenie w 'created' (mozna wybrac inny w programie).
     */
    async submitCertificate(
        token: unknown,
        body: unknown
    ): Promise<{ files: ProgramPreparedFile[] }> {
        const job = await this.loadJobByToken(token);
        this.assertState(job, 'created');
        const chain = SigningJobValidator.parseCertificateChain(body);
        const now = this.deps.now();
        const verified = verifySigningCertificate(chain, {
            now,
            allowlist: this.deps.allowlist,
        });

        // Czy to ten sam certyfikat co zapamietany dla osoby? Roznica = ostrzezenie, nie blokada.
        const known = await this.deps.repository.findPersonCertificate(job.createdByPersonId);
        const changed =
            !!known &&
            (known.certSerial !== verified.serial ||
                known.certIssuerSha256 !== verified.issuerSha256);

        const claimed = await this.deps.repository.transition(
            job.id,
            ['created'],
            'preparing',
            {
                certSerial: verified.serial,
                certSubjectCn: verified.subjectCn,
                certIssuer: verified.issuerCn,
                certChain: chain,
                certChangedWarning: changed,
            }
        );
        if (!claimed)
            return fail(
                'WRONG_STATE',
                'To zlecenie jest już w użyciu. Zacznij podpisywanie od nowa w PS.',
                409
            );
        if (!known) {
            await this.deps.repository.rememberPersonCertificate({
                personId: job.createdByPersonId,
                certSerial: verified.serial,
                certIssuerSha256: verified.issuerSha256,
                certSubjectCn: verified.subjectCn,
                firstJobId: job.id,
            });
        }

        const files = await this.deps.repository.listFiles(job.id, false);
        const prepared: ProgramPreparedFile[] = [];
        try {
            const letter = await this.requireLetterForJob(job);
            for (const file of files) {
                const bytes = await this.fetchSourcePdf(file, letter);
                let result;
                try {
                    result = await prepare(bytes, chain, this.placementFor(file), { now });
                } catch (error) {
                    throw new SigningJobError(
                        'PREPARE_FAILED',
                        `Plik „${file.displayName}” ${describeSigningError(error)}.`,
                        422
                    );
                }
                await this.deps.repository.saveFilePrepared(file.id, {
                    preparedPdf: result.preparedPdf,
                    signedAttrsDer: result.signedAttrsDer,
                    checkCode: result.checkCode,
                    pages: result.pages,
                });
                prepared.push({
                    name: file.displayName,
                    pages: result.pages,
                    checkCode: result.checkCode,
                    hashToSign: result.hashToSign.toString('hex'),
                });
            }
        } catch (error) {
            const message =
                error instanceof SigningJobError
                    ? error.message
                    : 'Nie udało się pobrać plików z Dysku Google. Spróbuj ponownie za chwilę.';
            await this.failJob(job, ['preparing'], message);
            throw error instanceof SigningJobError
                ? error
                : new SigningJobError('DRIVE_FAILED', message, 502);
        }

        const ready = await this.deps.repository.transition(job.id, ['preparing'], 'prepared', {
            preparedAt: this.deps.now(),
        });
        if (!ready) {
            // Anulowane albo wygasle w trakcie: zapisane wyzej PDF-y nie moga zostac w zleceniu.
            await this.deps.repository.clearSensitive(job.id);
            return fail('WRONG_STATE', 'Zlecenie zmieniło stan w trakcie przygotowania.', 409);
        }
        return { files: prepared };
    }

    private placementFor(file: JobFileRecord): SignaturePlacement {
        if (file.sourceKind === 'LETTER_DOC') return 'letterClosing';
        return file.withGraphic ? 'lastPageCorner' : 'none';
    }

    private async requireLetterForJob(
        job: JobRecord
    ): Promise<LetterContext & { gdDocumentId: string; gdFolderId: string }> {
        const letter = await this.deps.repository.getLetterContext(job.letterId);
        if (!letter || !letter.gdDocumentId || !letter.gdFolderId)
            return fail('BAD_REQUEST', 'Pismo nie ma już dokumentu albo folderu na Dysku.', 409);
        return letter as LetterContext & { gdDocumentId: string; gdFolderId: string };
    }

    /** Zamraza tresc pliku zrodlowego jako PDF. Tylko odczyt z Dysku. */
    private async fetchSourcePdf(
        file: JobFileRecord,
        letter: { gdDocumentId: string; gdFolderId: string }
    ): Promise<Buffer> {
        const tooBig = () =>
            new SigningJobError(
                'PREPARE_FAILED',
                `Plik „${file.displayName}” jest za duży do podpisania w PS (limit ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)} MB).`,
                422
            );
        if (file.sourceKind === 'LETTER_DOC') {
            if (file.sourceGdFileId !== letter.gdDocumentId)
                throw new SigningJobError(
                    'PREPARE_FAILED',
                    'Dokument pisma został zmieniony po założeniu zlecenia. Zacznij od nowa.',
                    409
                );
            const bytes = await this.deps.drive.exportToPdf(file.sourceGdFileId);
            if (bytes.length > MAX_PDF_BYTES) throw tooBig();
            return bytes;
        }
        const meta = await this.deps.drive.getFile(file.sourceGdFileId);
        if (!meta || meta.trashed || !(meta.parents ?? []).includes(letter.gdFolderId))
            throw new SigningJobError(
                'PREPARE_FAILED',
                `Pliku „${file.displayName}” nie ma już w folderze pisma.`,
                409
            );
        let bytes: Buffer;
        if (meta.mimeType === MIME_PDF) {
            if (meta.size !== undefined && meta.size > MAX_PDF_BYTES) throw tooBig();
            bytes = await this.deps.drive.downloadFile(meta.id);
        } else if (meta.mimeType === MIME_GOOGLE_DOC || meta.mimeType === MIME_GOOGLE_SHEET) {
            bytes = await this.deps.drive.exportToPdf(meta.id);
        } else {
            throw new SigningJobError(
                'PREPARE_FAILED',
                `Plik „${file.displayName}” ma format, którego nie podpisujemy.`,
                422
            );
        }
        if (bytes.length > MAX_PDF_BYTES) throw tooBig();
        return bytes;
    }

    /**
     * Krok 3 kontraktu: program odsyla podpisy (wszystkie pliki naraz). Wszystko albo nic:
     * najpierw skladamy i sprawdzamy KAZDY podpisany plik w pamieci, dopiero potem zapisujemy
     * pliki na Dysk, czytamy z powrotem folder nadrzedny, zapisujemy rejestr i konczymy zlecenie.
     */
    async submitSignatures(
        token: unknown,
        body: unknown
    ): Promise<{ status: JobStatus }> {
        const job = await this.loadJobByToken(token);
        this.assertState(job, 'prepared');
        const files = await this.deps.repository.listFiles(job.id, true);
        const signatures = SigningJobValidator.parseSignatures(body, files.length);

        const claimed = await this.deps.repository.transition(
            job.id,
            ['prepared'],
            'finalizing'
        );
        if (!claimed)
            return fail(
                'WRONG_STATE',
                'To zlecenie jest już w użyciu. Zacznij podpisywanie od nowa w PS.',
                409
            );

        // --- Faza 1: skladanie i sprawdzanie w pamieci. Zero zapisow na Dysku. ---
        const chain = job.certChain;
        const signed: Buffer[] = [];
        try {
            if (!chain || chain.length === 0)
                throw new SigningJobError('SIGNATURE_REJECTED', 'Brak certyfikatu w zleceniu.', 422);
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.preparedPdf || !file.signedAttrsDer)
                    throw new SigningJobError(
                        'SIGNATURE_REJECTED',
                        `Plik „${file.displayName}” nie ma przygotowanej zawartości.`,
                        409
                    );
                let output: Buffer;
                try {
                    output = finalize(file.preparedPdf, file.signedAttrsDer, signatures[i], chain);
                } catch (error) {
                    throw new SigningJobError(
                        'SIGNATURE_REJECTED',
                        `Podpis pod plikiem „${file.displayName}” jest nieprawidłowy: ${describeSigningError(error)}.`,
                        422
                    );
                }
                const check = validate(output);
                if (!check.valid || !check.byteRangeCoversFile || check.certSerial !== job.certSerial)
                    throw new SigningJobError(
                        'SIGNATURE_REJECTED',
                        `Po złożeniu podpisu plik „${file.displayName}” nie przeszedł sprawdzenia.`,
                        422
                    );
                signed.push(output);
            }
        } catch (error) {
            await this.failJob(
                job,
                ['finalizing'],
                error instanceof SigningJobError
                    ? error.message
                    : 'Nie udało się złożyć podpisanych plików.'
            );
            throw error;
        }

        // --- Faza 2: zapis na Dysk (jedyne miejsce zapisow w zleceniu). ---
        const letter = await this.deps.repository.getLetterContext(job.letterId);
        const folderId = letter?.gdFolderId ?? null;
        const uploaded: Array<{ file: JobFileRecord; id: string; name: string }> = [];
        try {
            if (!folderId) throw new Error('Pismo nie ma już folderu na Dysku.');
            const taken = new Set(
                (await this.deps.drive.listFolder(folderId)).map((f) => f.name)
            );
            const now = this.deps.now();
            for (let i = 0; i < files.length; i++) {
                const name = signedFileName(files[i].displayName, taken, now);
                taken.add(name);
                const created = await this.deps.drive.uploadPdf({
                    name,
                    parentFolderId: folderId,
                    bytes: signed[i],
                });
                uploaded.push({ file: files[i], id: created.id, name });
                const back = await this.deps.drive.getFile(created.id);
                if (!back || back.trashed || !(back.parents ?? []).includes(folderId))
                    throw new Error(
                        `Plik „${name}” nie pojawił się w folderze pisma po zapisie.`
                    );
            }
            await this.deps.runInTransaction(async (conn) => {
                for (const item of uploaded) {
                    await this.deps.repository.saveFileSigned(
                        item.file.id,
                        item.id,
                        item.name,
                        conn
                    );
                    await this.deps.repository.insertSignature(
                        {
                            sourceType:
                                item.file.sourceKind === 'LETTER_DOC'
                                    ? 'LETTER'
                                    : 'LETTER_ATTACHMENT',
                            sourceGdFileId: item.file.sourceGdFileId,
                            signedGdFileId: item.id,
                            signedName: item.name,
                            letterId: job.letterId,
                            method: 'LOCAL_APP',
                            certSubjectCn: job.certSubjectCn as string,
                            certSerial: job.certSerial as string,
                            certIssuer: job.certIssuer as string,
                            signerPersonId: job.createdByPersonId,
                            jobId: job.id,
                            signedAt: now,
                        },
                        conn
                    );
                }
                const done = await this.deps.repository.transition(
                    job.id,
                    ['finalizing'],
                    'done',
                    { finishedAt: now },
                    conn
                );
                if (!done) throw new Error('Zlecenie zmieniło stan w trakcie zapisu.');
            });
        } catch (error) {
            // Wszystko albo nic: to, co juz trafilo na Dysk, wraca do kosza (odwracalnie).
            for (const item of uploaded) {
                try {
                    await this.deps.drive.trashFile(item.id);
                } catch (cleanupError) {
                    console.error(
                        `[Signing] Nie udało się wyrzucić do kosza ${item.id} po nieudanym zleceniu ${job.id}:`,
                        cleanupError
                    );
                }
            }
            const message =
                'Nie udało się zapisać podpisanych plików na Dysku Google. Nic nie zostało zapisane - spróbuj ponownie.';
            await this.failJob(job, ['finalizing'], message);
            console.error(`[Signing] Zapis zlecenia ${job.id} nieudany:`, error);
            throw new SigningJobError('DRIVE_FAILED', message, 502);
        }
        // Po zatwierdzeniu: blad sprzatania nie moze cofac zapisanych plikow (dokonczy go sprzatanie zbiorcze).
        try {
            await this.deps.repository.clearSensitive(job.id);
        } catch (error) {
            console.error(`[Signing] Czyszczenie danych zlecenia ${job.id} po podpisie nieudane:`, error);
        }
        return { status: 'done' };
    }

    // ------------------------------------------------------------------ "Wgraj podpisany"

    /**
     * Reczne wgranie PDF podpisanego gdzie indziej. Podpis jest sprawdzany kryptograficznie
     * (validate z SIG-1) i tym samym zestawem kontroli certyfikatu co podpis z programu.
     * Zawartosc nie jest dopasowywana do pisma - wybor nalezy do uzytkownika.
     */
    async uploadSigned(
        personId: number,
        letterId: number,
        file: { buffer?: Buffer; size?: number } | undefined,
        scope?: ProjectScope
    ): Promise<ManualUploadResult> {
        const letter = await this.requireLetter(letterId, scope);
        const bytes = SigningJobValidator.assertPdfUpload(file);

        let check;
        try {
            check = validate(bytes);
        } catch {
            return fail('UPLOAD_REJECTED', 'Nie udało się odczytać podpisu w tym pliku PDF.', 422);
        }
        if (!check.valid || !check.byteRangeCoversFile) {
            const unsigned = check.reasons.some((r) => /no signature/i.test(r));
            return fail(
                'UPLOAD_REJECTED',
                unsigned
                    ? 'Ten PDF nie ma podpisu elektronicznego.'
                    : 'Podpis w tym PDF jest uszkodzony albo plik zmieniono po podpisaniu.',
                422
            );
        }
        const now = this.deps.now();
        const verified = verifySigningCertificate(check.chainDer, {
            now,
            allowlist: this.deps.allowlist,
        });
        if (verified.serial !== check.certSerial)
            return fail('UPLOAD_REJECTED', 'Certyfikat w podpisie nie zgadza się z łańcuchem.', 422);

        const known = await this.deps.repository.findPersonCertificate(personId);
        const changed =
            !!known &&
            (known.certSerial !== verified.serial ||
                known.certIssuerSha256 !== verified.issuerSha256);

        // --- Dopiero tu zapis na Dysk. ---
        const doc = await this.deps.drive.getFile(letter.gdDocumentId);
        const taken = new Set(
            (await this.deps.drive.listFolder(letter.gdFolderId)).map((f) => f.name)
        );
        const name = signedFileName(doc?.name || letter.number || 'pismo', taken, now);
        let createdId: string | undefined;
        try {
            const created = await this.deps.drive.uploadPdf({
                name,
                parentFolderId: letter.gdFolderId,
                bytes,
            });
            createdId = created.id;
            const back = await this.deps.drive.getFile(created.id);
            if (!back || back.trashed || !(back.parents ?? []).includes(letter.gdFolderId))
                throw new Error('Plik nie pojawił się w folderze pisma po zapisie.');
            await this.deps.runInTransaction(async (conn) => {
                await this.deps.repository.insertSignature(
                    {
                        sourceType: 'LETTER',
                        sourceGdFileId: letter.gdDocumentId,
                        signedGdFileId: created.id,
                        signedName: name,
                        letterId: letter.id,
                        method: 'MANUAL_UPLOAD',
                        certSubjectCn: verified.subjectCn,
                        certSerial: verified.serial,
                        certIssuer: verified.issuerCn,
                        signerPersonId: personId,
                        jobId: null,
                        signedAt: now,
                    },
                    conn
                );
                if (!known) {
                    await this.deps.repository.rememberPersonCertificate(
                        {
                            personId,
                            certSerial: verified.serial,
                            certIssuerSha256: verified.issuerSha256,
                            certSubjectCn: verified.subjectCn,
                            firstJobId: null,
                        },
                        conn
                    );
                }
            });
        } catch (error) {
            if (createdId) {
                try {
                    await this.deps.drive.trashFile(createdId);
                } catch (cleanupError) {
                    console.error('[Signing] Nie udało się wyrzucić do kosza pliku:', cleanupError);
                }
            }
            console.error('[Signing] Wgranie podpisanego pliku nieudane:', error);
            return fail(
                'DRIVE_FAILED',
                'Nie udało się zapisać pliku na Dysku Google. Spróbuj ponownie.',
                502
            );
        }
        return {
            signedGdFileId: createdId as string,
            signedName: name,
            signedUrl: driveUrl(createdId as string),
            signerName: verified.subjectCn,
            certChangedWarning: changed,
        };
    }
}

/** Domyslne zaleznosci produkcyjne (bez Dysku: tego dostarcza router). */
export function defaultTransaction<T>(
    callback: (conn: Connection) => Promise<T>
): Promise<T> {
    return ToolsDb.transaction<T>(callback);
}

export function defaultScopeGuard(
    letterId: number,
    scope?: ProjectScope
): Promise<void> {
    return ProjectScopeGuard.assertLetterInScope(letterId, scope);
}
