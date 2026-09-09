/**
 * GUS-2 — porównanie podmiotu z PS z tym, co o nim mówi rejestr GUS, i werdykt.
 *
 * Pack GUS, checkpoint GUS-2 (decyzja D-GUS-1, pułapka P-3):
 *   20_projects/Aplikacje/PS.APP.01/plans/2026-09-09-gus-synchronizacja-podmiotow-plan.md
 *
 * Cały plik jest czystą funkcją: żadnej bazy, żadnej sieci, żadnego czasu. Dzięki temu
 * normalizacja i werdykt dają się przetestować bez GUS-u i bez MySQL-a.
 *
 * Pułapka P-3 — normalizacja służy WYŁĄCZNIE porównaniu i nigdy nie wraca do zapisu.
 * GUS pisze „SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" i „AL. PAŁACOWA", PS ma
 * „Sp. z o.o." i „Aleja Pałacowa". Bez sprowadzenia obu zapisów do wspólnej postaci
 * prawie każdy podmiot dostałby DIFF i plakietka zamieniłaby się w szum.
 */

/** Słownik stanów kolumny Entities.GusStatus (migracja 002). Pilnuje go kod, nie ENUM. */
export type GusStatus =
    | 'NOT_CHECKED'
    | 'OK'
    | 'DIFF'
    | 'NOT_FOUND'
    | 'CLOSED'
    | 'ERROR';

/** Pola, które można przepisać z migawki do rekordu przez /gus/accept. */
export type GusAcceptableField = 'name' | 'address' | 'regon' | 'krs';

export const GUS_ACCEPTABLE_FIELDS: GusAcceptableField[] = [
    'name',
    'address',
    'regon',
    'krs',
];

/** To, co GUS powiedział przy ostatnim sprawdzeniu — treść kolumny Entities.GusSnapshot. */
export type GusSnapshot = {
    name?: string;
    address?: string;
    regon?: string;
    krs?: string;
    /** Data zakończenia działalności z rejestru; obecna = podmiot już nie działa. */
    closedAt?: string;
};

/** Dane podmiotu po stronie PS, brane do porównania. */
export type GusComparableEntity = {
    name?: string | null;
    address?: string | null;
    regon?: string | null;
    krs?: string | null;
};

export type GusDifference = {
    field: GusAcceptableField;
    /** Wartość zapisana w PS — tak jak jest, bez normalizacji. */
    inPs: string;
    /** Wartość z rejestru GUS — tak jak przyszła, bez normalizacji. */
    inGus: string;
};

export type GusCompareResult = {
    status: Extract<GusStatus, 'OK' | 'DIFF' | 'CLOSED'>;
    differences: GusDifference[];
};

const DIACRITICS: Record<string, string> = {
    ą: 'a',
    ć: 'c',
    ę: 'e',
    ł: 'l',
    ń: 'n',
    ó: 'o',
    ś: 's',
    ź: 'z',
    ż: 'z',
};

/**
 * Frazy sprowadzane do wspólnej postaci. Kolejność ma znaczenie: dłuższa forma idzie
 * pierwsza, żeby „spółka komandytowo-akcyjna" nie została po drodze zjedzona przez
 * regułę spółki komandytowej.
 *
 * Skróty po prawej są umowne (spzoo, sa, spj...) — nie pokazujemy ich człowiekowi,
 * służą wyłącznie temu, żeby dwa zapisy tej samej formy prawnej dały ten sam tekst.
 */
const PHRASES: [RegExp, string][] = [
    // najpierw samo słowo „spółka" schodzi do „sp", żeby dalsze reguły miały jeden
    // wzorzec do dopasowania zamiast dwóch („SPÓŁKA JAWNA" i „sp. j." to ta sama forma)
    [/\bspolka\b/g, 'sp'],
    // formy prawne
    [/\bsp z ograniczona odpowiedzialnoscia\b/g, 'spzoo'],
    [/\bsp z o o\b/g, 'spzoo'],
    [/\bsp komandytowo akcyjna\b/g, 'ska'],
    [/\bs k a\b/g, 'ska'],
    [/\bsp komandytowa\b/g, 'spk'],
    [/\bsp k\b/g, 'spk'],
    [/\bsp jawna\b/g, 'spj'],
    [/\bsp j\b/g, 'spj'],
    [/\bsp partnerska\b/g, 'spp'],
    [/\bsp p\b/g, 'spp'],
    [/\bsp cywilna\b/g, 'sc'],
    [/\bs c\b/g, 'sc'],
    [/\bsp akcyjna\b/g, 'sa'],
    [/\bs a\b/g, 'sa'],
    // elementy adresu
    [/\bulica\b/g, 'ul'],
    [/\b(aleja|aleje|alei)\b/g, 'al'],
    [/\bosiedle\b/g, 'os'],
    [/\bplac\b/g, 'pl'],
];

/**
 * Sprowadza tekst do postaci, w której da się porównać zapis z PS z zapisem z GUS.
 * Wynik jest nieczytelny dla człowieka i nigdy nie trafia do bazy ani na ekran.
 */
export function normalizeForCompare(value: unknown): string {
    let text = String(value ?? '').toLowerCase();
    text = text.replace(/[ąćęłńóśźż]/g, (c) => DIACRITICS[c] ?? c);
    // kropki, przecinki i cudzysłowy znikają: „Sp. z o.o." i „SP Z O O" mają dać to samo
    text = text.replace(/[.,;:"'„”«»]/g, ' ');
    // kod pocztowy raz z myślnikiem (35-303), raz bez (35303) — obie postacie do cyfr
    text = text.replace(/\b(\d{2})-(\d{3})\b/g, '$1$2');
    text = text.replace(/\s+/g, ' ').trim();
    for (const [pattern, replacement] of PHRASES) {
        text = text.replace(pattern, replacement);
    }
    return text.replace(/\s+/g, ' ').trim();
}

/** True gdy oba zapisy znaczą to samo (albo gdy nie ma czego porównywać). */
export function isSameAfterNormalization(a: unknown, b: unknown): boolean {
    return normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Porównuje rekord PS z migawką GUS i wydaje werdykt.
 *
 * Różnicą jest wyłącznie sprzeczność: obie strony mają wartość i te wartości znaczą
 * co innego. Puste pole w PS nie jest różnicą, tylko brakiem do uzupełnienia (dziś
 * REGON i KRS są puste w całym słowniku — gdyby liczyły się jako różnica, każdy podmiot
 * dostałby DIFF i plakietka nic by nie mówiła). Puste pole po stronie GUS też nie jest
 * różnicą: rejestr nie zaprzecza temu, czego nie podaje.
 *
 * `CLOSED` bije `DIFF`: gdy GUS podaje datę zakończenia działalności, to jest
 * najważniejsza wiadomość o tym podmiocie. Lista różnic i tak wraca, bo ekran (GUS-4)
 * pokazuje ją obok plakietki.
 */
export function compareWithGus(
    entity: GusComparableEntity,
    snapshot: GusSnapshot
): GusCompareResult {
    const differences: GusDifference[] = [];

    for (const field of GUS_ACCEPTABLE_FIELDS) {
        const inPs = String(entity[field] ?? '').trim();
        const inGus = String(snapshot[field] ?? '').trim();
        if (!inPs || !inGus) continue;
        if (isSameAfterNormalization(inPs, inGus)) continue;
        differences.push({ field, inPs, inGus });
    }

    const isClosed = !!String(snapshot.closedAt ?? '').trim();
    if (isClosed) return { status: 'CLOSED', differences };
    return {
        status: differences.length > 0 ? 'DIFF' : 'OK',
        differences,
    };
}
