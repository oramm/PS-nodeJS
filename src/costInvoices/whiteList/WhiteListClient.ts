import { isValidNipChecksum, normalizeNip } from '../../contracts/aqmSync/AqmSync';

/**
 * Status weryfikacji rachunku bankowego dostawcy na Bialej Liscie VAT (KAS wl-api).
 * Frozen contract (owner-frozen, checkpoint NIP-K1):
 *  NOT_CHECKED       - domyslny, jeszcze nie weryfikowano
 *  VERIFIED_OK       - rachunek przypisany do NIP (accountAssigned === "TAK")
 *  VERIFIED_MISMATCH - rachunek NIE jest przypisany do NIP (accountAssigned === "NIE")
 *  ERROR             - blad/timeout wywolania KAS (fail-open — NIGDY nie blokuje importu)
 *  NOT_APPLICABLE    - brak SupplierBankAccount lub brak/niepoprawny NIP (bez wywolania API)
 */
export type WhiteListStatus =
    | 'NOT_CHECKED'
    | 'VERIFIED_OK'
    | 'VERIFIED_MISMATCH'
    | 'ERROR'
    | 'NOT_APPLICABLE';

export type WhiteListCheckResult = {
    status: WhiteListStatus;
    requestId?: string;
    checkedAt: Date;
};

const WL_API_BASE_URL = 'https://wl-api.mf.gov.pl/api/check/nip';
const REQUEST_TIMEOUT_MS = 10000;

/** Konwertuje wartosc z DB na WhiteListStatus z zabezpieczeniem przed nieoczekiwanymi wartosciami. */
export function toWhiteListStatus(val: unknown): WhiteListStatus {
    const valid: WhiteListStatus[] = ['NOT_CHECKED', 'VERIFIED_OK', 'VERIFIED_MISMATCH', 'ERROR', 'NOT_APPLICABLE'];
    return valid.includes(val as WhiteListStatus) ? (val as WhiteListStatus) : 'NOT_CHECKED';
}

function normalizeNrb(nrb: unknown): string {
    return String(nrb ?? '').replace(/\D/g, '');
}

function isValidNrb(nrb: string): boolean {
    return /^\d{26}$/.test(nrb);
}

function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Klient Bialej Listy podatnikow VAT (KAS wl-api.mf.gov.pl) — bez klucza,
 * limit fair-use ok. 300 zapytan/dzien. ponytail: zwykly fetch, zero nowych zaleznosci.
 */
export default class WhiteListClient {
    /**
     * Sprawdza czy `nrb` jest przypisany do `nip` na Bialej Liscie wg stanu na `date` (domyslnie dzis).
     * Brak/niepoprawny nip lub nrb -> NOT_APPLICABLE bez wywolania HTTP.
     * Blad HTTP/sieciowy/timeout/nieoczekiwany ksztalt odpowiedzi -> ERROR.
     * Nigdy nie rzuca wyjatku (fail-open) — kazda sciezka konczy sie zwroceniem wyniku.
     */
    async check(
        nip: string | undefined,
        nrb: string | undefined,
        date: Date = new Date(),
    ): Promise<WhiteListCheckResult> {
        const checkedAt = new Date();
        const normalizedNip = normalizeNip(nip);
        const normalizedNrb = normalizeNrb(nrb);

        if (!nip || !nrb || !isValidNipChecksum(normalizedNip) || !isValidNrb(normalizedNrb)) {
            return { status: 'NOT_APPLICABLE', checkedAt };
        }

        try {
            const url = `${WL_API_BASE_URL}/${normalizedNip}/bank-account/${normalizedNrb}?date=${formatDate(date)}`;
            // AbortSignal.timeout covers the WHOLE request, incl. the body read (response.json()),
            // so a stalled KAS body during an outage cannot hang the serial import. (Node 18+, zero-dep.)
            const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

            if (!response.ok) {
                return { status: 'ERROR', checkedAt };
            }

            const body: any = await response.json();
            const accountAssigned = body?.result?.accountAssigned;
            const requestId = body?.result?.requestId != null ? String(body.result.requestId) : undefined;

            if (accountAssigned === 'TAK') {
                return { status: 'VERIFIED_OK', requestId, checkedAt };
            }
            if (accountAssigned === 'NIE') {
                return { status: 'VERIFIED_MISMATCH', requestId, checkedAt };
            }

            // Nieoczekiwany ksztalt odpowiedzi — traktuj jak blad (fail-open).
            return { status: 'ERROR', requestId, checkedAt };
        } catch (err) {
            // Blad sieciowy / timeout / parse — fail-open, nigdy nie rzucaj dalej.
            return { status: 'ERROR', checkedAt };
        }
    }
}
