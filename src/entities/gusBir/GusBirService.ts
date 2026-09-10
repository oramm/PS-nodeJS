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
    /**
     * GUS-2: data zakończenia działalności z rejestru (pusta = podmiot działa).
     * GUS podaje ją przy wyszukaniu, a dla osób prawnych powtarza w pełnym raporcie —
     * raport jest świeższy, więc gdy go pobrano i coś w nim jest, ma pierwszeństwo.
     */
    closedAt?: string;
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

/**
 * GPO-1 / D-GPO-2 — rejestr odpowiedział, ale z odpowiedzi nie da się odczytać nazwy.
 *
 * CELOWO NIE JEST TO GusBirNotFoundError. Tamten znaczy „rejestr nie zna tego numeru"
 * i kasuje zapisaną migawkę, bo stara odpowiedź jest wtedy nieaktualna. Tutaj nie wiemy,
 * co rejestr chciał powiedzieć — więc nie mamy prawa wyrzucić tego, co mówił poprzednio.
 * Obaj wołający (sprawdzenie jednego podmiotu i przebieg słownika) łapią to zwykłym
 * `catch`, który zapisuje sam stan „błąd" i migawki nie dotyka.
 */
export class GusBirEmptyRecordError extends Error {
    constructor(nip: string) {
        super(
            `Rejestr GUS odpowiedział na NIP ${nip}, ale w odpowiedzi nie ma nazwy podmiotu`
        );
        this.name = 'GusBirEmptyRecordError';
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

/** Pusty tekst i same białe znaki znaczą tu „GUS nic nie podał", nie „wartość pusta". */
function textOrUndefined(raw: unknown): string | undefined {
    const text = String(raw ?? '').trim();
    return text ? text : undefined;
}

/**
 * GPO-1 / D-GPO-1 — jeden wpis z odpowiedzi rejestru.
 *
 * `search({nip})` oddaje TABLICĘ, gdy pod jednym numerem siedzi więcej niż jedna jednostka.
 * Zmierzone na produkcji 2026-09-10 dla 9 podmiotów, w dwóch kształtach: spółka czynna obok
 * wykreślonego poprzednika, oraz działalność gospodarcza obok gospodarstwa rolnego tej samej
 * osoby (ten sam REGON, oba czynne). Wcześniej kod czytał `Nazwa` z tablicy, czyli z niczego.
 *
 * Reguła: odpadają wpisy wykreślone z rejestru, chyba że wykreślone są wszystkie — wtedy
 * zostają, bo to jest prawdziwa wiadomość o tym podmiocie. Z reszty wygrywa najniższy
 * `SilosID`, czyli numer dziedziny rejestru: 1 to zwykła działalność gospodarcza, 2
 * gospodarstwo rolne, 6 rejestr sądowy. Przy remisie pierwszy z listy.
 *
 * Świadomie NIE dopasowujemy wpisu do nazwy zapisanej w PS: porównanie zaczęłoby wybierać
 * sobie ten wpis, który najlepiej pasuje, i zawsze wychodziłoby „zgodny".
 */
function pickRegistryRecord(found: unknown): any | undefined {
    const records: any[] = Array.isArray(found) ? found : found ? [found] : [];
    if (records.length <= 1) return records[0];

    const active = records.filter(
        (record) => !textOrUndefined(record?.DataZakonczeniaDzialalnosci)
    );
    const candidates = active.length > 0 ? active : records;

    return [...candidates].sort(
        (a, b) => Number(a?.SilosID ?? 99) - Number(b?.SilosID ?? 99)
    )[0];
}

/** True gdy KRS znaczy faktycznie KRS (rejestr przedsiębiorców), nie inny rejestr/ewidencja GUS. */
function extractKrs(detail: any): string | undefined {
    const registryName: string = String(detail?.praw_rodzajRejestruEwidencji_Nazwa ?? '');
    const krs: string = String(detail?.praw_numerWRejestrzeEwidencji ?? '').trim();
    if (!krs || !registryName.includes('REJESTR PRZEDSIĘBIORC')) return undefined;
    return krs;
}

/**
 * GUS-3 / pułapka P-5 — uchwyt do jednej sesji z rejestrem GUS.
 *
 * Biblioteka `bir1` loguje się do GUS przy pierwszym zapytaniu i trzyma sesję (ważną
 * godzinę) w obiekcie. Typ jest celowo nieprzezroczysty: poza serwisem nikt nie ma
 * wołać metod `bir1` wprost, uchwyt służy wyłącznie do przekazania go do lookupByNip.
 */
export type GusBirSession = { readonly __gusBirSession: unique symbol };

export default class GusBirService {
    /** Brak klucza w env -> lookup jest fail-closed (503 po stronie routera). */
    static isConfigured(): boolean {
        return !!Setup.GusBir.key;
    }

    /**
     * GUS-3 / pułapka P-5 — otwiera JEDNĄ sesję z rejestrem GUS do wielokrotnego użycia.
     *
     * Pojedyncze „Pobierz z GUS" z ekranu tego nie potrzebuje i dalej tworzy sesję samo.
     * Potrzebuje tego przebieg partiami: bez tego każdy z ~385 podmiotów logowałby się
     * do GUS osobno, czyli podwajał liczbę wywołań usługi i czas przebiegu.
     */
    static openSession(): GusBirSession {
        if (!this.isConfigured()) throw new GusBirNotConfiguredError();
        // Lazy require: only touch bir1 (and its GUS SOAP session) when actually configured/called.
        const Bir = require('bir1').default;
        return new Bir({ key: Setup.GusBir.key }) as GusBirSession;
    }

    /**
     * Wyszukuje podmiot po NIP (zakłada, że NIP już przeszedł isValidNipChecksum
     * po stronie routera). Rzuca GusBirNotConfiguredError / GusBirNotFoundError;
     * inne błędy (sieć/GUS) propagują się nienaruszone do routera (-> 500/next).
     *
     * `session` (GUS-3): gdy podana, zapytanie idzie istniejącą sesją zamiast otwierać
     * nową. Pominięta = zachowanie sprzed GUS-3, czyli sesja na jedno zapytanie.
     */
    static async lookupByNip(
        nip: string,
        session?: GusBirSession
    ): Promise<GusBirEntity> {
        if (!this.isConfigured()) throw new GusBirNotConfiguredError();

        const { BirError } = require('bir1');
        const bir: any = session ?? this.openSession();

        let found: unknown;
        try {
            found = await bir.search({ nip });
        } catch (err) {
            if (err instanceof BirError) throw new GusBirNotFoundError(nip);
            throw err;
        }

        // GPO-1 / D-GPO-1: z kilku wpisów pod jednym NIP-em bierzemy jeden, według reguły.
        const basic: any = pickRegistryRecord(found);

        // GPO-1 / D-GPO-2, kontrola negatywna: bez nazwy nie ma czego porównywać.
        // Pusta migawka przechodziła dotąd przez porównanie jako „brak różnic", czyli
        // odpowiedź, której nikt nie umiał odczytać, wyglądała jak potwierdzenie zgodności.
        const name = String(basic?.Nazwa ?? '').trim();
        if (!name) throw new GusBirEmptyRecordError(nip);

        let addressFields: AddressFields = {
            ulica: basic?.Ulica,
            nr: basic?.NrNieruchomosci,
            lokal: basic?.NrLokalu,
            kod: basic?.KodPocztowy,
            miejscowosc: basic?.Miejscowosc,
        };
        let krs: string | undefined;
        let closedAt: string | undefined = textOrUndefined(
            basic?.DataZakonczeniaDzialalnosci
        );

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
                closedAt =
                    textOrUndefined(detail?.praw_dataZakonczeniaDzialalnosci) ??
                    closedAt;
            } catch {
                // Report failure (transient GUS glitch etc.) -> keep the search() address, no KRS.
            }
        }

        return {
            name,
            address: buildAddress(addressFields),
            regon: basic?.Regon ? String(basic.Regon).trim() : undefined,
            krs,
            closedAt,
        };
    }
}
