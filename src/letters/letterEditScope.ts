import { LetterData } from '../types/types';

/**
 * Stan pisma odczytany z bazy przed edycją. Wyłącznie te pola, które decydują
 * o tym, co dzieje się na Dysku Google: identyfikatory dokumentu i folderu,
 * dane trafiające do zakresów nazwanych oraz podmioty.
 *
 * Ten typ istnieje po to, żeby kontroler NIE mógł przez pomyłkę oprzeć decyzji
 * o Dysku na obiekcie zbudowanym z żądania klienta.
 */
export type LetterDbEditContext = {
    id: number;
    number: string | null;
    description: string | null;
    creationDate: string | null;
    registrationDate: string | null;
    gdDocumentId: string | null;
    gdFolderId: string | null;
    /** klucze `ROLA:id` podmiotów pisma, posortowane */
    entityKeys: string[];
};

/** `Date` z bazy albo `string` z payloadu sprowadzone do `YYYY-MM-DD`. */
function normalizeDate(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = `${value.getMonth() + 1}`.padStart(2, '0');
        const d = `${value.getDate()}`.padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
}

function normalizeText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value).trim();
}

/** Klucze `ROLA:id` z obiektu pisma przysłanego przez klienta. */
export function makeEntityKeys(letter: LetterData): string[] {
    const keys: string[] = [];
    (letter._entitiesMain || []).forEach((entity) => {
        if (entity?.id) keys.push(`MAIN:${entity.id}`);
    });
    (letter._entitiesCc || []).forEach((entity) => {
        if (entity?.id) keys.push(`CC:${entity.id}`);
    });
    return keys.sort();
}

/**
 * Czy edycja zmienia WYŁĄCZNIE powiązania ze sprawami.
 *
 * Odpowiedź opiera się na porównaniu stanu z bazy z tym, co przysłał klient,
 * pole po polu — a nie na deklaracji klienta w `_fieldsToUpdate`. Deklaracja
 * jest dobrowolna i front pism jej nie wysyła, więc oparta na niej ochrona
 * dokumentu nie działałaby dla człowieka pracującego w formularzu.
 *
 * Porównywane są dokładnie te pola, które trafiają do zakresów nazwanych
 * dokumentu albo do nazwy folderu pisma (`OurLetterGdFile.makeDataforNamedRanges`,
 * `LetterGdController.makeFolderName`): numer, opis, data utworzenia, data
 * rejestracji oraz podmioty. Zestaw spraw jest celowo pominięty — to jego zmiana
 * ma przestać ruszać dokument.
 *
 * @param filesCount liczba załączników w żądaniu; jakikolwiek plik oznacza
 *   pracę na Dysku i wyklucza pominięcie
 */
export function isCasesOnlyEdit(
    dbContext: LetterDbEditContext | undefined,
    letter: LetterData,
    filesCount: number
): boolean {
    if (!dbContext) return false;
    if (filesCount > 0) return false;

    if (normalizeText(dbContext.number) !== normalizeText(letter.number))
        return false;
    if (
        normalizeText(dbContext.description) !==
        normalizeText(letter.description)
    )
        return false;
    if (
        normalizeDate(dbContext.creationDate) !==
        normalizeDate(letter.creationDate)
    )
        return false;
    if (
        normalizeDate(dbContext.registrationDate) !==
        normalizeDate(letter.registrationDate)
    )
        return false;

    const payloadEntityKeys = makeEntityKeys(letter);
    if (payloadEntityKeys.length !== dbContext.entityKeys.length) return false;
    return payloadEntityKeys.every(
        (key, index) => key === dbContext.entityKeys[index]
    );
}
