/**
 * Prosta, deterministyczna miara podobieństwa tekstu dla LIS-6 detektora 2.
 * Bez bibliotek zewnętrznych, bez LLM — patrz plan, sekcja "Jak to zbudować".
 *
 * Kroki:
 *   1. Normalizacja: małe litery, usunięcie polskich ogonków, usunięcie interpunkcji.
 *   2. Tokenizacja po białych znakach, odrzucenie tokenów krótszych niż 4 znaki
 *      (przyimki, spójniki, liczby porządkowe punktów agendy typu "04.01").
 *   3. Odrzucenie słów pospolitych: ogólna lista funkcyjna polska + dwa zwroty
 *      domenowe z nagłówków agend spotkań ("Sprawy bieżące", "Koordynacja") —
 *      te same zwroty, które plan LIS nazywa wprost "ostatecznością" dla spraw
 *      bez własnego przedmiotu (reguła 6 w "Regułach wyboru sprawy"), więc jako
 *      identyfikator tematu są szumem, nie sygnałem.
 *   4. Prymitywne stemowanie: dla słów >=5 znaków obcięcie dwóch ostatnich znaków,
 *      żeby zbliżyć do siebie odmiany przez przypadki (stacja/stacji/stacje ->
 *      "stacj", instalacja/instalacji -> "instalac"). Nie jest to lingwistyczny
 *      stemmer, tylko przybliżenie — wystarczające przy porównaniu zbiorów słów.
 *   5. Podobieństwo Jaccarda na zbiorach tokenów (część wspólna / suma zbiorów).
 */

const STOPWORDS = new Set([
    'oraz', 'dla', 'przy', 'jest', 'sie', 'się', 'nie', 'tego', 'tej', 'tym', 'ten', 'ta', 'to',
    'jako', 'czy', 'ale', 'lub', 'ktory', 'ktora', 'ktore', 'ktorego', 'ktorej', 'po', 'od', 'do',
    'na', 'za', 'pod', 'nad', 'przez', 'bez', 'wraz', 'wobec', 'wedlug', 'wg', 'tak', 'tylko',
    'jeszcze', 'juz', 'byc', 'bede', 'bedzie', 'byla', 'byl', 'bylo',
    'sprawy', 'sprawie', 'sprawa', 'pismo', 'pisma',
    'informujemy', 'informuje', 'przesylam', 'przesylamy', 'dotyczy', 'dotyczacy', 'dotyczaca',
    'dotyczace', 'dotyczacego', 'wniosek', 'wniosku', 'opinia', 'opinii', 'inzyniera', 'inzynier',
    'kontraktu', 'kontrakt', 'panstwa', 'panstwu', 'uprzejmie', 'prosimy', 'prosze', 'zwiazku',
    'zgodnie', 'ponizej', 'powyzej', 'niniejszym', 'niniejsze', 'wzgledu', 'celu', 'sposob',
    'sposobu',
    // zwroty-nagłówki agend spotkań — patrz komentarz nad stałą
    'biezace', 'biezaca', 'biezacych', 'koordynacja', 'koordynacji', 'koordynacje',
]);

const MIN_TOKEN_LENGTH = 4;

export function normalizeText(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/ą/g, 'a')
        .replace(/ć/g, 'c')
        .replace(/ę/g, 'e')
        .replace(/ł/g, 'l')
        .replace(/ń/g, 'n')
        .replace(/ó/g, 'o')
        .replace(/ś/g, 's')
        .replace(/ż/g, 'z')
        .replace(/ź/g, 'z')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stem(word: string): string {
    if (word.length >= 5) return word.slice(0, word.length - 2);
    return word;
}

export function tokenize(text: string | null | undefined): string[] {
    return normalizeText(text)
        .split(' ')
        .filter((w) => w.length >= MIN_TOKEN_LENGTH && !/^\d+$/.test(w) && !STOPWORDS.has(w))
        .map(stem);
}

export function wordBag(text: string | null | undefined): Set<string> {
    return new Set(tokenize(text));
}

export function jaccardSimilarity(
    a: Set<string>,
    b: Set<string>
): { score: number; intersection: string[]; unionSize: number } {
    const intersection = [...a].filter((x) => b.has(x));
    const union = new Set([...a, ...b]);
    return {
        score: union.size ? intersection.length / union.size : 0,
        intersection,
        unionSize: union.size,
    };
}

/**
 * Overlap coefficient = |A ∩ B| / min(|A|, |B|).
 *
 * W tym korpusie sprawy mają bardzo nierówną ilość tekstu — jedna ma kilka pism,
 * druga tylko jeden tytuł ustalenia ze spotkania. Jaccard karze taką asymetrię
 * (duży mianownik = suma zbiorów), więc para o tym samym przedmiocie, ale
 * nierównej ilości treści, dostaje niski wynik. Overlap coefficient pyta
 * wprost: "czy cały (mały) temat sprawy B mieści się w opisie sprawy A?" —
 * to jest miara, która faktycznie wyłapuje parę 13653/13709.
 */
export function overlapCoefficient(
    a: Set<string>,
    b: Set<string>
): { score: number; intersection: string[]; smallerSize: number } {
    const intersection = [...a].filter((x) => b.has(x));
    const smallerSize = Math.min(a.size, b.size);
    return {
        score: smallerSize ? intersection.length / smallerSize : 0,
        intersection,
        smallerSize,
    };
}
