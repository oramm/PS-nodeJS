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

/**
 * Słownik stanów kolumny Entities.GusStatus (migracja 002). Pilnuje go kod, nie ENUM,
 * dlatego dopisanie stanu nie wymaga migracji — kolumna to varchar(16).
 *
 * GUS-4a: `DIFF` znaczy „jest co najmniej jedna różnica co do rzeczy”, `DIFF_MINOR` —
 * „tę samą treść rejestr zapisuje inaczej”. Podział wziął się z pomiaru: pierwszy pełny
 * przebieg dał różnicę przy 242 z 379 podmiotów i plakietka w tej postaci byłaby szumem.
 */
export const GUS_STATUSES = [
    'NOT_CHECKED',
    'OK',
    'DIFF',
    'DIFF_MINOR',
    'NOT_FOUND',
    'CLOSED',
    'ERROR',
] as const;

export type GusStatus = (typeof GUS_STATUSES)[number];

/** GPO-3: sito na wartości z żądania — do zapytania wchodzą wyłącznie kody ze słownika. */
export function isGusStatus(value: unknown): value is GusStatus {
    return (GUS_STATUSES as readonly string[]).includes(String(value));
}

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

/**
 * GUS-4a — rodzaj różnicy.
 *
 * `MATERIAL` — co do rzeczy: rejestr pokazuje inny punkt na mapie albo inny podmiot.
 * `WORDING` — zapisu: ta sama treść zapisana inaczej (rejestr rozwija imię w nazwie
 * ulicy, PS trzyma nazwę skróconą, inna interpunkcja, odwrócony porządek adresu).
 */
export type GusDifferenceKind = 'MATERIAL' | 'WORDING';

export type GusDifference = {
    field: GusAcceptableField;
    /** Wartość zapisana w PS — tak jak jest, bez normalizacji. */
    inPs: string;
    /** Wartość z rejestru GUS — tak jak przyszła, bez normalizacji. */
    inGus: string;
    kind: GusDifferenceKind;
};

export type GusCompareResult = {
    status: Extract<GusStatus, 'OK' | 'DIFF' | 'DIFF_MINOR' | 'CLOSED'>;
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
 * GUS-4a — wyrazy, które nic nie znaczą przy dopasowaniu nazwy: spójniki, przyimki,
 * skróty adresowe i formy prawne (te po normalizeForCompare są jednym tokenem).
 */
const NOISE_TOKENS = new Set([
    'w', 'we', 'i', 'z', 'ze', 'na', 'do', 'przy', 'oraz', 'nr', 'lok', 'im', 'm',
    'ul', 'al', 'os', 'pl',
    'sp', 'spzoo', 'sa', 'spk', 'spj', 'spp', 'sc', 'ska',
]);

/** Skróty, po których zaczyna się ulica — koniec nazwy miejscowości. */
const STREET_MARKERS = new Set(['ul', 'al', 'os', 'pl']);

/**
 * Tekst rozbity na wyrazy. Poza normalizacją do porównania lecą jeszcze ukośniki
 * i cudzysłowy: w danych zastanych trafiają się w środku nazwy (rekordy 289 i 692)
 * i bez tego rozbijają wyraz na dwa kawałki, których nigdzie nie da się odnaleźć.
 */
function allTokens(value: unknown): string[] {
    return normalizeForCompare(value)
        .replace(/[\\/"'`]/g, ' ')
        .split(/[\s\-–—]+/)
        .filter((token) => token.length > 0);
}

/** Same wyrazy znaczące — bez spójników, skrótów adresowych i form prawnych. */
function significantTokens(value: unknown): string[] {
    return allTokens(value).filter((token) => !NOISE_TOKENS.has(token));
}

/** Ten sam wyraz w innej odmianie: „Będzinie" i „Będzin", „Wodociągów" i „Wodociągi". */
function isSameStem(a: string, b: string): boolean {
    const shorter = Math.min(a.length, b.length);
    if (shorter < 5) return false;
    let common = 0;
    while (common < shorter && a[common] === b[common]) common++;
    return common >= 5 && common >= shorter - 3;
}

/**
 * Skrótowiec branżowy: „MPWiK" to pierwsze litery „Miejskie Przedsiębiorstwo Wodociągów
 * i Kanalizacji", „ZWiK" — „Zakład Wodociągów i Kanalizacji". Tak PS zapisuje spory
 * kawałek słownika i nie jest to wiadomość o innym podmiocie.
 *
 * Litery muszą się ułożyć w kolejności słów rejestru; słowa pominięte po drodze nie
 * przeszkadzają, bo PS skraca nierówno („ZWIK" bez „i").
 */
function isAcronymOf(token: string, words: string[]): boolean {
    if (token.length < 3) return false;
    let matched = 0;
    for (const word of words) {
        if (matched < token.length && word[0] === token[matched]) matched++;
    }
    return matched === token.length;
}

/** Czy wyraz z nazwy w PS da się odnaleźć w tym, co podaje rejestr. */
function isTokenCovered(
    token: string,
    gusNameWords: string[],
    haystack: string[]
): boolean {
    if (haystack.includes(token)) return true;
    if (haystack.some((word) => isSameStem(word, token))) return true;
    return isAcronymOf(token, gusNameWords);
}

/**
 * NAZWA — różnica jest co do rzeczy, gdy któregoś ze znaczących wyrazów nazwy z PS
 * nie da się odnaleźć w tym, co podaje rejestr. Wtedy albo pod tym NIP-em siedzi inny
 * podmiot („INIKO Grupa MGGP", a rejestr mówi „HTS"), albo doszło do zmiany nazwy
 * prawnej („MPWiK w Krakowie", a rejestr „Wodociągi Miasta Krakowa").
 *
 * Odwrotnie: gdy wszystko z PS jest w rejestrze, to rejestr po prostu mówi więcej —
 * pełna nazwa prawna zamiast skróconej albo handlowej. To jest różnica zapisu.
 *
 * Do przeszukania wchodzi też adres z rejestru, bo PS dokleja do nazwy skróconej
 * miasto siedziby („MPWiK Żywiec") — miasto zgodne z adresem rejestru niczemu nie
 * przeczy.
 */
function classifyName(inPs: string, snapshot: GusSnapshot): GusDifferenceKind {
    const psWords = significantTokens(inPs);
    if (psWords.length === 0) return 'WORDING';
    const gusNameWords = allTokens(snapshot.name);
    const haystack = [
        ...significantTokens(snapshot.name),
        ...significantTokens(snapshot.address),
    ];
    return psWords.every((word) => isTokenCovered(word, gusNameWords, haystack))
        ? 'WORDING'
        : 'MATERIAL';
}

/** Mysliniki dlugie na zwykle: kod „34–300” ma znaczyć to samo co „34-300”. */
function withPlainDashes(value: unknown): string {
    return String(value ?? '').replace(/[–—]/g, '-');
}

/** Kody pocztowe z tekstu, sprowadzone do pięciu cyfr (35-303 i 35303 to ten sam kod). */
function postalCodes(value: unknown): string[] {
    const found = withPlainDashes(value).match(/\b\d{2}-?\d{3}\b/g) ?? [];
    return found.map((code) => code.replace('-', ''));
}

/**
 * Miejscowości z tekstu adresu: to, co stoi tuż za kodem pocztowym, aż do przecinka,
 * do początku ulicy albo do pierwszej liczby.
 *
 * Zaczepienie o kod pocztowy zamiast o pozycję w tekście jest tu celowe: adres jest
 * w PS jednym polem i bywa zapisany w obu porządkach — „59-300 Lubin, ul. Rzeźnicza 4"
 * i „ul. Rzeźnicza 4, 59-300 Lubin" dają tę samą miejscowość. Kodów bywa w polu więcej
 * niż jeden (dopisek „adres korespond.:"), stąd lista, nie pojedyncza wartość.
 */
function cities(value: unknown): string[] {
    const text = withPlainDashes(value);
    const result: string[] = [];
    const pattern = /\b\d{2}-?\d{3}\b([^,;]*)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const words: string[] = [];
        for (const word of allTokens(match[1])) {
            if (STREET_MARKERS.has(word) || /\d/.test(word)) break;
            if (NOISE_TOKENS.has(word)) continue;
            words.push(word);
        }
        if (words.length > 0) result.push(words.join(' '));
    }
    return result;
}

/** Czy zbiory mają część wspólną (z tolerancją na odmianę wyrazu). */
function intersects(a: string[], b: string[]): boolean {
    return a.some((x) => b.some((y) => x === y || isSameStem(x, y)));
}

/**
 * Czy obie strony mówią o tej samej miejscowości.
 *
 * Poza wprost porównaniem miejscowości dopuszczamy jeszcze jeden układ: nazwa
 * miejscowości z jednej strony stoi gdzie indziej w adresie drugiej strony. Tak wygląda
 * wieś z pocztą w miasteczku obok — PS pisze „Bystrzyca Dolna 55A, 58-100 Świdnica”
 * (adres pocztowy), rejestr „55A, 58-100 Bystrzyca Dolna” (miejscowość). To ten sam
 * punkt na mapie zapisany dwoma konwencjami.
 *
 * Ten luz działa wyłącznie przy zgodnym kodzie pocztowym — sprawdzenie kodu idzie
 * wcześniej i odcina przypadki spod innego adresu.
 */
function citiesAgree(
    inPs: string,
    inGus: string,
    psCities: string[],
    gusCities: string[]
): boolean {
    if (intersects(psCities, gusCities)) return true;
    const psText = normalizeForCompare(inPs);
    const gusText = normalizeForCompare(inGus);
    return (
        gusCities.some((city) => psText.includes(city)) ||
        psCities.some((city) => gusText.includes(city))
    );
}

/**
 * Numery domów z adresu, sprowadzone do wspólnej postaci. „15 lok. 6", „15/6" i „15 m. 6"
 * mają dać to samo, „nr 2C" to po prostu „2C".
 *
 * Zwracany jest sam numer budynku: z ciągu liczb stojących obok siebie liczy się pierwsza,
 * bo dalsze to mieszkanie („15/6") albo koniec zakresu („11-19"), a o tym, pod którym
 * budynkiem siedzi podmiot, nic nie mówią. Liczba, przed którą stoi wyraz, zaczyna nowy
 * ciąg — dzięki temu „ul. 3 Maja 4" daje numery 3 i 4, a nie jeden z nich, i adres z „3
 * Maja" nie rozjeżdża się z tym samym adresem zapisanym inaczej.
 *
 * Pięciocyfrowa liczba to kod pocztowy po normalizacji (35-303 na 35303), nie numer domu.
 */
function houseNumbers(value: unknown): string[] {
    const text = normalizeForCompare(withPlainDashes(value))
        .replace(/\b\d{5}\b/g, ' ')
        .replace(/\b(nr|lok|m)\b/g, ' ')
        // „46 d" i „46D" to ten sam budynek: litera stojąca luzem wraca do numeru
        .replace(/\b(\d+)\s+([a-z])\b/g, '$1$2');
    const result: string[] = [];
    let previousWasNumber = false;
    for (const token of text.split(/[\s\-/\\]+/).filter(Boolean)) {
        const isNumber = /^\d+[a-z]?$/.test(token);
        if (isNumber && !previousWasNumber) result.push(token);
        previousWasNumber = isNumber;
    }
    return result;
}

/**
 * Wyrazy nazwy ulicy: adres bez kodu pocztowego, bez numerów i bez nazwy miejscowości
 * (tej z własnej strony — po drugiej bywa inna konwencja, patrz `citiesAgree`).
 *
 * Pojedyncza litera wypada: to inicjał imienia („ul. F.M. Lanciego"), a nie nazwa.
 */
function streetWords(value: unknown, ownCities: string[]): string[] {
    const cityWords = new Set(ownCities.flatMap((city) => city.split(' ')));
    return significantTokens(withPlainDashes(value)).filter(
        (token) =>
            token.length > 1 && !/\d/.test(token) && !cityWords.has(token)
    );
}

/**
 * Skrót wyrazu: „Ks." to „Księcia", „Św." — „Świętego", „gen. ST." — „gen. Stanisława",
 * „b-pa" — „biskupa". Litery skrótu muszą się ułożyć w kolejności liter pełnego wyrazu;
 * warunek działa tylko dla najwyżej trzech liter, bo dłuższy wyraz to już nazwa, nie skrót.
 */
function isShortFormOf(token: string, word: string): boolean {
    if (token.length > 3 || word.length <= token.length) return false;
    let matched = 0;
    for (const letter of word) if (letter === token[matched]) matched++;
    return matched === token.length;
}

/** Czy wszystkie wyrazy z `inner` da się odnaleźć w `outer` (odmiana i skrót w cenie). */
function wordsContained(inner: string[], outer: string[]): boolean {
    return inner.every((word) =>
        outer.some(
            (other) =>
                other === word ||
                isSameStem(other, word) ||
                isShortFormOf(word, other)
        )
    );
}

/**
 * ADRES — różnica jest co do rzeczy, gdy to inny punkt na mapie: inny kod pocztowy, inna
 * miejscowość, inny numer domu albo inna ulica. Reszta idzie jako różnica zapisu.
 *
 * Gdy którejkolwiek ze stron nie da się odczytać kodu ani miejscowości, różnica zostaje
 * istotna: lepiej pokazać za dużo, niż zamieść pod dywan prawdziwą rozbieżność.
 *
 * ULICA — ta sama zasada zawierania, co przy nazwie podmiotu. Rejestr rozwija imię
 * („Kościuszki" na „Tadeusza Kościuszki"), więc wyrazy jednej strony zawarte w wyrazach
 * drugiej to różnica zapisu. Nazwy, które nie zawierają się w żadną stronę („Spacerowa"
 * wobec „Kwiatowa"), mówią o innym miejscu — i to nawet przy zgodnym numerze domu.
 *
 * CZEGO TA REGUŁA ŚWIADOMIE NIE ŁAPIE: różnicy tam, gdzie strona wpisała sam numer bez
 * nazwy ulicy (numeracja wiejska) — nazwa pustej strony zawiera się w czymkolwiek. Numer
 * domu i tak jest wtedy porównywany.
 */
function classifyAddress(inPs: string, inGus: string): GusDifferenceKind {
    const psCodes = postalCodes(inPs);
    const gusCodes = postalCodes(inGus);
    const psCities = cities(inPs);
    const gusCities = cities(inGus);

    if (
        psCodes.length === 0 ||
        gusCodes.length === 0 ||
        psCities.length === 0 ||
        gusCities.length === 0
    )
        return 'MATERIAL';

    if (!intersects(psCodes, gusCodes)) return 'MATERIAL';
    if (!citiesAgree(inPs, inGus, psCities, gusCities)) return 'MATERIAL';

    const psNumbers = houseNumbers(inPs);
    const gusNumbers = houseNumbers(inGus);
    if (
        psNumbers.length > 0 &&
        gusNumbers.length > 0 &&
        !intersects(psNumbers, gusNumbers)
    )
        return 'MATERIAL';

    const psStreet = streetWords(inPs, psCities);
    const gusStreet = streetWords(inGus, gusCities);
    if (
        !wordsContained(psStreet, gusStreet) &&
        !wordsContained(gusStreet, psStreet)
    )
        return 'MATERIAL';

    return 'WORDING';
}

/**
 * GUS-4a — rodzaj pojedynczej różnicy.
 *
 * REGON i KRS zostają zawsze istotne: to numery nadane przez rejestr, więc albo się
 * zgadzają, albo mówią o innym podmiocie — nie ma tu „innego zapisu tej samej treści".
 */
function classifyDifference(
    field: GusAcceptableField,
    inPs: string,
    inGus: string,
    snapshot: GusSnapshot
): GusDifferenceKind {
    if (field === 'name') return classifyName(inPs, snapshot);
    if (field === 'address') return classifyAddress(inPs, inGus);
    return 'MATERIAL';
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
 * WERDYKT JEST DWUSTOPNIOWY (GUS-4a, decyzja właściciela 2026-09-09). `DIFF` zapala się
 * tylko wtedy, gdy jest co najmniej jedna różnica co do rzeczy. Gdy wszystkie różnice są
 * zapisu, wychodzi `DIFF_MINOR` — cicha lista do jednorazowego przejrzenia, nie alarm.
 *
 * `CLOSED` bije jedno i drugie: gdy GUS podaje datę zakończenia działalności, to jest
 * najważniejsza wiadomość o tym podmiocie. Lista różnic i tak wraca, bo ekran pokazuje
 * ją obok plakietki.
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
        differences.push({
            field,
            inPs,
            inGus,
            kind: classifyDifference(field, inPs, inGus, snapshot),
        });
    }

    const isClosed = !!String(snapshot.closedAt ?? '').trim();
    if (isClosed) return { status: 'CLOSED', differences };
    if (differences.length === 0) return { status: 'OK', differences };
    const hasMaterial = differences.some((diff) => diff.kind === 'MATERIAL');
    return { status: hasMaterial ? 'DIFF' : 'DIFF_MINOR', differences };
}
