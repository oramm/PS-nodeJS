import {
    MAX_FILES_PER_JOB,
    MAX_LETTERS_PER_SUMMARY,
    MAX_PDF_BYTES,
    TOKEN_PATTERN,
} from './SigningJobsConfig';
import { SigningJobError } from './SigningJobError';
import { SourceKind } from './SigningJobRepository';

export interface RequestedFile {
    kind: SourceKind;
    gdFileId?: string;
    withGraphic: boolean;
}

export interface CreateJobDto {
    letterId: number;
    files: RequestedFile[];
}

export interface SubmittedSignature {
    index: number;
    signature: Buffer;
}

const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CERT_DER_BYTES = 16 * 1024;
const MAX_CHAIN_LENGTH = 10;
const MAX_SIGNATURE_BYTES = 1024;
const MAX_REASON_LENGTH = 255;

const bad = (message: string): never => {
    throw new SigningJobError('BAD_REQUEST', message, 400);
};

function decodeBase64(value: unknown, what: string, maxBytes: number): Buffer {
    if (typeof value !== 'string' || value.length === 0 || !BASE64_PATTERN.test(value))
        return bad(`${what}: nieprawidłowe dane (oczekiwano base64).`);
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length === 0 || bytes.length > maxBytes)
        return bad(`${what}: nieprawidłowy rozmiar.`);
    return bytes;
}

/**
 * Walidacja danych wejsciowych zlecen podpisu (sama skladnia i limity, bez dostepu do bazy
 * i Dysku). Osobna klasa, zgodnie z architektura; wolana przez kontroler.
 */
export default class SigningJobValidator {
    static isTokenFormat(token: unknown): token is string {
        return typeof token === 'string' && TOKEN_PATTERN.test(token);
    }

    static parseCreateJob(body: any): CreateJobDto {
        const letterId = Number(body?.letterId);
        if (!Number.isInteger(letterId) || letterId <= 0)
            return bad('Brak identyfikatora pisma.');
        const files = body?.files;
        if (!Array.isArray(files) || files.length === 0)
            return bad('Wybierz co najmniej jeden plik do podpisania.');
        if (files.length > MAX_FILES_PER_JOB)
            return bad(`W jednym zleceniu można podpisać najwyżej ${MAX_FILES_PER_JOB} plików.`);

        const seen = new Set<string>();
        let letterDocs = 0;
        const parsed: RequestedFile[] = files.map((raw: any) => {
            const kind = raw?.kind;
            if (kind !== 'LETTER_DOC' && kind !== 'DRIVE_FILE')
                return bad('Nieznany rodzaj pliku w zleceniu.');
            let gdFileId: string | undefined;
            if (kind === 'DRIVE_FILE') {
                if (typeof raw.gdFileId !== 'string' || !DRIVE_ID_PATTERN.test(raw.gdFileId))
                    return bad('Nieprawidłowy identyfikator pliku z Dysku Google.');
                gdFileId = raw.gdFileId;
            } else {
                letterDocs++;
            }
            const key = kind === 'LETTER_DOC' ? 'LETTER_DOC' : `F:${gdFileId}`;
            if (seen.has(key)) return bad('Ten sam plik wybrano dwa razy.');
            seen.add(key);
            // Pismo zawsze z grafika - wymusza kontroler; tu tylko normalizujemy typ.
            return { kind, gdFileId, withGraphic: raw.withGraphic === true };
        });
        if (letterDocs > 1) return bad('Pismo można wybrać tylko raz.');
        return { letterId, files: parsed };
    }

    static parseCertificateChain(body: any): Buffer[] {
        const chain = body?.chain;
        if (!Array.isArray(chain) || chain.length === 0)
            return bad('Brak certyfikatu w żądaniu.');
        if (chain.length > MAX_CHAIN_LENGTH)
            return bad('Łańcuch certyfikatów jest nienormalnie długi.');
        return chain.map((item: unknown, i: number) =>
            decodeBase64(item, `Certyfikat ${i + 1}`, MAX_CERT_DER_BYTES)
        );
    }

    /** Podpisy dla wszystkich plikow naraz: indeksy musza byc dokladnie 0..fileCount-1. */
    static parseSignatures(body: any, fileCount: number): Buffer[] {
        const items = body?.signatures;
        if (!Array.isArray(items) || items.length !== fileCount)
            return bad('Liczba podpisów nie zgadza się z liczbą plików w zleceniu.');
        const parsed: SubmittedSignature[] = items.map((item: any) => {
            const index = item?.index;
            if (!Number.isInteger(index) || index < 0 || index >= fileCount)
                return bad('Nieprawidłowy numer pliku przy podpisie.');
            return {
                index,
                signature: decodeBase64(item.signature, 'Podpis', MAX_SIGNATURE_BYTES),
            };
        });
        const ordered: Buffer[] = new Array(fileCount);
        for (const { index, signature } of parsed) {
            if (ordered[index]) return bad('Ten sam plik podpisano dwa razy.');
            ordered[index] = signature;
        }
        return ordered;
    }

    static parseCancelReason(body: any): string | null {
        const reason = body?.reason;
        if (reason === undefined || reason === null) return null;
        if (typeof reason !== 'string') return bad('Nieprawidłowy powód anulowania.');
        const trimmed = reason.trim().slice(0, MAX_REASON_LENGTH);
        return trimmed.length > 0 ? trimmed : null;
    }

    /** Identyfikatory pism do zbiorczego zapytania o podpisy: unikalne, dodatnie, z limitem. */
    static parseLetterIds(body: any): number[] {
        const raw = body?.letterIds;
        if (!Array.isArray(raw)) return bad('Brak listy pism.');
        const ids = new Set<number>();
        for (const item of raw) {
            const id = Number(item);
            if (!Number.isInteger(id) || id <= 0) return bad('Nieprawidłowy identyfikator pisma.');
            ids.add(id);
        }
        if (ids.size > MAX_LETTERS_PER_SUMMARY)
            return bad(`Jednorazowo można sprawdzić najwyżej ${MAX_LETTERS_PER_SUMMARY} pism.`);
        return [...ids];
    }

    static parseFileIndex(raw: unknown): number {
        const index = Number(raw);
        if (!Number.isInteger(index) || index < 0 || index >= MAX_FILES_PER_JOB)
            return bad('Nieprawidłowy numer pliku.');
        return index;
    }

    static assertPdfUpload(file: { buffer?: Buffer; size?: number } | undefined): Buffer {
        const bytes = file?.buffer;
        if (!bytes || bytes.length === 0)
            return bad('Nie otrzymano pliku. Wybierz podpisany PDF.');
        if (bytes.length > MAX_PDF_BYTES)
            return bad(
                `Plik jest za duży (limit ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)} MB).`
            );
        if (bytes.subarray(0, 1024).indexOf('%PDF-') < 0)
            throw new SigningJobError(
                'UPLOAD_REJECTED',
                'To nie jest plik PDF. Wgraj podpisany PDF.',
                422
            );
        return bytes;
    }
}
