import Setup from '../../setup/Setup';

/**
 * NIP-G1 — GUS BIR (REGON) lookup, "Pobierz z GUS" button on the Entity form.
 * Frozen contract: GUS = independent `bir1` impl in PS. Address = server-side
 * concatenation into the existing `Entities.address` string (no schema change).
 *
 * BLOCKED until gate G-N1 (owner delivers the real GUS key): without
 * GUS_BIR_KEY in env, isConfigured() is false and lookupByNip() throws
 * GusBirNotConfiguredError — the router maps that to 503 (fail-closed;
 * lookup is an opt-in button, missing key breaks nothing else).
 *
 * `bir1` is an ESM package (Node 22 `require(esm)` support makes plain
 * `require()` work under this repo's CommonJS build — no dynamic import
 * needed). Method used: DaneSzukajPodmioty (`search`) to find the entity by
 * NIP, then DanePobierzPelnyRaport (`report`) on legal entities (Typ 'P',
 * 9-digit REGON) for the KRS/registry number — that number never applies to
 * individuals, so sole traders (Typ 'F') skip the report call and use the
 * address already returned by `search`. ponytail: no CEIDG report parsing.
 */

export type GusBirEntity = {
    name: string;
    address: string;
    regon?: string;
    krs?: string;
};

export class GusBirNotConfiguredError extends Error {
    constructor() {
        super('Wyszukiwanie GUS nie jest skonfigurowane (brak GUS_BIR_KEY)');
        this.name = 'GusBirNotConfiguredError';
    }
}

export class GusBirNotFoundError extends Error {
    constructor(nip: string) {
        super(`Nie znaleziono podmiotu o NIP ${nip} w rejestrze GUS`);
        this.name = 'GusBirNotFoundError';
    }
}

type AddressFields = {
    ulica?: string;
    nr?: string;
    lokal?: string;
    kod?: string;
    miejscowosc?: string;
};

/** GUS zwraca kod pocztowy raz z myślnikiem (search), raz bez (report) — ujednolica na NN-NNN. */
function formatPostalCode(raw: string | undefined): string {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length !== 5) return (raw ?? '').trim();
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** Konkatenacja adresu po stronie serwera (frozen: NO structural address columns), np. "ul. Piękna 5, 00-001 Warszawa". */
export function buildAddress(fields: AddressFields): string {
    const streetBase = [fields.ulica, fields.nr].filter((v) => v && v.trim()).join(' ').trim();
    const street = fields.lokal && fields.lokal.trim() ? `${streetBase}/${fields.lokal.trim()}` : streetBase;
    const cityLine = [formatPostalCode(fields.kod), fields.miejscowosc]
        .filter((v) => v && v.trim())
        .join(' ')
        .trim();
    return [street, cityLine].filter((v) => v && v.trim()).join(', ');
}

/** True gdy KRS znaczy faktycznie KRS (rejestr przedsiębiorców), nie inny rejestr/ewidencja GUS. */
function extractKrs(detail: any): string | undefined {
    const registryName: string = String(detail?.praw_rodzajRejestruEwidencji_Nazwa ?? '');
    const krs: string = String(detail?.praw_numerWRejestrzeEwidencji ?? '').trim();
    if (!krs || !registryName.includes('REJESTR PRZEDSIĘBIORC')) return undefined;
    return krs;
}

export default class GusBirService {
    /** Brak klucza w env -> lookup jest fail-closed (503 po stronie routera). */
    static isConfigured(): boolean {
        return !!Setup.GusBir.key;
    }

    /**
     * Wyszukuje podmiot po NIP (zakłada, że NIP już przeszedł isValidNipChecksum
     * po stronie routera). Rzuca GusBirNotConfiguredError / GusBirNotFoundError;
     * inne błędy (sieć/GUS) propagują się nienaruszone do routera (-> 500/next).
     */
    static async lookupByNip(nip: string): Promise<GusBirEntity> {
        if (!this.isConfigured()) throw new GusBirNotConfiguredError();

        // Lazy require: only touch bir1 (and its GUS SOAP session) when actually configured/called.
        const Bir = require('bir1').default;
        const { BirError } = require('bir1');
        const bir = new Bir({ key: Setup.GusBir.key });

        let basic: any;
        try {
            basic = await bir.search({ nip });
        } catch (err) {
            if (err instanceof BirError) throw new GusBirNotFoundError(nip);
            throw err;
        }

        let addressFields: AddressFields = {
            ulica: basic?.Ulica,
            nr: basic?.NrNieruchomosci,
            lokal: basic?.NrLokalu,
            kod: basic?.KodPocztowy,
            miejscowosc: basic?.Miejscowosc,
        };
        let krs: string | undefined;

        // Detailed report only for legal entities (head office, 9-digit REGON) —
        // that's where GUS carries the registry/KRS number; sole traders never
        // have one, so the search() result is used as-is for them.
        if (basic?.Typ === 'P' && basic?.Regon?.length === 9) {
            try {
                const detail = await bir.report({ regon: basic.Regon, report: 'BIR11OsPrawna' });
                if (detail?.praw_adSiedzUlica_Nazwa || detail?.praw_adSiedzMiejscowosc_Nazwa) {
                    addressFields = {
                        ulica: detail.praw_adSiedzUlica_Nazwa,
                        nr: detail.praw_adSiedzNumerNieruchomosci,
                        lokal: detail.praw_adSiedzNumerLokalu,
                        kod: detail.praw_adSiedzKodPocztowy,
                        miejscowosc: detail.praw_adSiedzMiejscowosc_Nazwa,
                    };
                }
                krs = extractKrs(detail);
            } catch {
                // Report failure (transient GUS glitch etc.) -> keep the search() address, no KRS.
            }
        }

        return {
            name: String(basic?.Nazwa ?? '').trim(),
            address: buildAddress(addressFields),
            regon: basic?.Regon ? String(basic.Regon).trim() : undefined,
            krs,
        };
    }
}
