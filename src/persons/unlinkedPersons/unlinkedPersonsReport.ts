import { PersonReferenceCount } from '../personReferences/PersonReferencesRepository';
import { UnlinkedPerson } from './UnlinkedPersonsRepository';

/** Osoba bez powiązań razem z inwentarzem śladów (gdzie jeszcze w bazie występuje jej numer). */
export type UnlinkedPersonReportEntry = UnlinkedPerson & {
    references: PersonReferenceCount[];
};

export type UnlinkedPersonsSummary = {
    total: number;
    withReferences: number;
    withoutReferences: number;
    withAccountRow: number;
    entities: number;
};

export const NO_REFERENCES_LABEL = 'brak';
export const NO_DATE_LABEL = 'brak';

/** Nagłówek trybu `--review` (kolumny rozdzielone tabulatorem - do otwarcia w arkuszu). */
export const REVIEW_HEADER = [
    'Id',
    'Nazwisko',
    'Imię',
    'Stanowisko',
    'Podmiot',
    'PodmiotId',
    'KontoZmienione',
    'Ślady',
].join('\t');

export function attachReferences(
    persons: UnlinkedPerson[],
    counts: Map<number, PersonReferenceCount[]>,
): UnlinkedPersonReportEntry[] {
    return persons.map((person) => ({
        ...person,
        references: counts.get(person.id) ?? [],
    }));
}

/** Data lokalna RRRR-MM-DD (bez przeskoku na UTC); brak wartości = „brak". */
export function formatDate(value: Date | string | null | undefined): string {
    if (!value) return NO_DATE_LABEL;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return NO_DATE_LABEL;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatReferences(refs: PersonReferenceCount[]): string {
    if (!refs.length) return NO_REFERENCES_LABEL;
    return refs.map((r) => `${r.ref}: ${r.count}`).join('; ');
}

/**
 * Wiersz domyślny: same numery i liczby - wolno wkleić do notatki z przeglądu.
 * Nigdy imię, nazwisko ani nazwa podmiotu (test tego pilnuje).
 */
export function formatIdsOnlyLine(entry: UnlinkedPersonReportEntry): string {
    return `${entry.id} (podmiot=${entry.entityId}, konto=${formatDate(
        entry.accountUpdatedAt,
    )}, ślady=${formatReferences(entry.references)})`;
}

/** Wiersz przeglądu (`--review`): z danymi osobowymi - tylko na ekran albo do pliku lokalnego. */
export function formatReviewLine(entry: UnlinkedPersonReportEntry): string {
    const clean = (value: string | null | undefined) =>
        (value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
    return [
        entry.id,
        clean(entry._surname),
        clean(entry._name),
        clean(entry._position),
        clean(entry._entityName),
        entry.entityId,
        formatDate(entry.accountUpdatedAt),
        formatReferences(entry.references),
    ].join('\t');
}

export function summarize(
    entries: UnlinkedPersonReportEntry[],
): UnlinkedPersonsSummary {
    const withReferences = entries.filter(
        (entry) => entry.references.length > 0,
    ).length;
    return {
        total: entries.length,
        withReferences,
        withoutReferences: entries.length - withReferences,
        withAccountRow: entries.filter(
            (entry) => entry.accountUpdatedAt !== null,
        ).length,
        entities: new Set(entries.map((entry) => entry.entityId)).size,
    };
}
