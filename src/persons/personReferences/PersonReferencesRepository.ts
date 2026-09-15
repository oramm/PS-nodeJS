import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

/** Jedna kolumna w bazie wskazująca na osobę (`Persons.Id`), np. `Letters.EditorId`. */
export type PersonReferenceColumn = { table: string; column: string };

/** Ile wierszy danej kolumny wskazuje na osobę; `ref` = `Tabela.Kolumna`. */
export type PersonReferenceCount = { ref: string; count: number };

/**
 * Kolumny wskazujące na osobę BEZ klucza obcego (pomiar ROD-0, 2026-09-07). Baza nie zna ich jako
 * relacji, więc `information_schema` ich nie odda i trzeba je wymienić ręcznie. Nazwy tabel w pisowni
 * z kodu repozytoriów: na produkcji (Linux) nazwy tabel rozróżniają wielkość liter, na kopii lokalnej nie.
 * ROD-6 ma dodać tym kolumnom klucze (`ON DELETE SET NULL`); wtedy odkrycie i ta lista zdublują się,
 * a `mergeReferenceColumns` scali je po (tabela, kolumna) bez rozróżniania wielkości liter - po wydaniu
 * ROD-6 listę można skasować.
 */
export const REFERENCE_COLUMNS_WITHOUT_FK: PersonReferenceColumn[] = [
    { table: 'Letters_Cases', column: 'EditorId' },
    { table: 'MeetingArrangements', column: 'EditorId' },
    { table: 'Meetings', column: 'EditorId' },
    { table: 'MilestoneTypes', column: 'EditorId' },
    { table: 'ProcessesSteps', column: 'EditorId' },
];

/**
 * Kolumny pomijane w inwentarzu: wiersz konta bez e-maila logowania to nie „powiązanie" (ROD-8, decyzja
 * ownera 2026-09-08 - konto ocenia się osobno, po e-mailu). Bez tego wyjątku każda osoba z pustym
 * wierszem konta po migracji 002 miałaby niepusty inwentarz i raport nie pokazałby nikogo „bez śladów".
 */
export const REFERENCE_COLUMNS_IGNORED: PersonReferenceColumn[] = [
    { table: 'PersonAccounts', column: 'PersonId' },
];

const columnKey = (col: PersonReferenceColumn): string =>
    `${col.table}.${col.column}`.toLowerCase();

/**
 * Scala kolumny odkryte w bazie z listą bez klucza: bez duplikatów (wielkość liter bez znaczenia),
 * bez kolumn pomijanych.
 */
export function mergeReferenceColumns(
    discovered: PersonReferenceColumn[],
    extra: PersonReferenceColumn[] = REFERENCE_COLUMNS_WITHOUT_FK,
    ignored: PersonReferenceColumn[] = REFERENCE_COLUMNS_IGNORED,
): PersonReferenceColumn[] {
    const ignoredKeys = new Set(ignored.map(columnKey));
    const seen = new Set<string>();
    const result: PersonReferenceColumn[] = [];
    for (const col of [...discovered, ...extra]) {
        const key = columnKey(col);
        if (ignoredKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        result.push(col);
    }
    return result;
}

/**
 * Jedno zapytanie: dla każdej kolumny liczba wierszy wskazujących na każdą z podanych osób.
 * Identyfikatory pochodzą z `information_schema`, a numery osób z bazy - mimo to wszystko jest
 * escapowane, bo zapytanie składa się z tekstu.
 */
export function buildReferenceCountsSql(
    columns: PersonReferenceColumn[],
    personIds: number[],
): string {
    if (!columns.length) throw new Error('Brak kolumn do policzenia odwołań');
    if (!personIds.length) throw new Error('Brak osób do policzenia odwołań');
    if (!personIds.every((id) => Number.isInteger(id) && id > 0))
        throw new Error(
            'Numery osób muszą być dodatnimi liczbami całkowitymi',
        );
    const idList = mysql.escape(personIds);
    return columns
        .map((col) => {
            const table = mysql.escapeId(col.table);
            const column = mysql.escapeId(col.column);
            const ref = mysql.escape(`${col.table}.${col.column}`);
            return `SELECT ${ref} AS ref, ${column} AS personId, COUNT(*) AS n FROM ${table} WHERE ${column} IN (${idList}) GROUP BY ${column}`;
        })
        .join('\nUNION ALL\n');
}

/**
 * Ludzkie etykiety powiązań do komunikatu odmowy kasowania (ROD-6). Klucz = `tabela.kolumna`
 * małymi literami. Czego nie ma na liście, pokazujemy surową nazwą `Tabela.Kolumna` (fallback) -
 * inwentarz jest dynamiczny (information_schema), więc mapa etykiet z natury jest częściowa i to jej
 * nie psuje. Konto bez e-maila (PersonAccounts.PersonId) nie jest tu liczone (pomijane w inwentarzu).
 */
const BLOCKER_LABELS: Record<string, string> = {
    'tasks.ownerid': 'zadania',
    'tasks_watchers.personid': 'obserwowane zadania',
    'issues.ownerid': 'zgłoszenia błędów',
    'scrumboardabsences.personid': 'nieobecności',
    'scrumboardplanningentries.personid': 'wpisy planowania',
    'scrumboardvacationentitlements.personid': 'pule urlopowe',
    'roles.personid': 'role kontraktowe',
    'persons_contracts.personid': 'powiązania z kontraktami',
    'staffmembers.personid': 'uprawnienia w panelu',
    'personprofiles.personid': 'profil',
    'personprojects.personid': 'przypisania do projektów',
    'personaccountevents.personid': 'historia zmian konta',
    'personaccountevents.editorid': 'autorstwo zmian konta',
    'publicprofilesubmissions.personid': 'zgłoszenia z formularza',
    'publicprofilesubmissions.lastlinkeventbypersonid': 'zgłoszenia z formularza (autor linku)',
    'publicprofilesubmissionlinks.personid': 'linki do formularza',
    'publicprofilesubmissionlinks.createdbypersonid': 'linki do formularza (autor)',
    'publicprofilesubmissionitems.reviewedbypersonid': 'recenzje pozycji formularza',
    'letters.editorid': 'pisma (jako edytor)',
    'letterevents.editorid': 'zdarzenia pism',
    'offers.editorid': 'oferty (jako edytor)',
    'offerevents.editorid': 'zdarzenia ofert',
    'offerinvitationmails.editorid': 'zaproszenia ofertowe',
    'securities.editorid': 'zabezpieczenia (ZNWU)',
    'sitevisits.personid': 'wizyty na budowie',
    'invoices.editorid': 'faktury (jako edytor)',
    'invoices.ownerid': 'faktury (jako właściciel)',
    'invoiceitems.editorid': 'pozycje faktur',
    'casetypes.editorid': 'typy spraw (jako edytor)',
    'contractmeetingnotes.createdbypersonid': 'notatki ze spotkań',
    'meetingarrangements.ownerid': 'ustalenia ze spotkań',
    'achievementsexternal.ownerid': 'osiągnięcia zewnętrzne',
    'ourcontractsdata.adminid': 'kontrakty (jako administrator)',
    'ourcontractsdata.managerid': 'kontrakty (jako menedżer)',
};

/**
 * Zamienia listę powiązań na czytelny opis do komunikatu odmowy kasowania (ROD-6), np.
 * „zadania: 3, uprawnienia w panelu: 1". Przy długiej liście skraca do `maxItems` i dopisuje „i inne (N)".
 * Czysta funkcja - testowalna bez bazy.
 */
export function describeBlockers(
    blockers: PersonReferenceCount[],
    maxItems = 6,
): string {
    if (!blockers.length) return '';
    const parts = blockers.map(
        (b) => `${BLOCKER_LABELS[b.ref.toLowerCase()] ?? b.ref}: ${b.count}`,
    );
    if (parts.length <= maxItems) return parts.join(', ');
    return `${parts.slice(0, maxItems).join(', ')} i inne (${parts.length - maxItems})`;
}

/**
 * Inwentarz odwołań do osoby w całej bazie (ROD-8: raport osób bez powiązań; ROD-6 użyje go przy
 * odmowie kasowania). Tylko odczyt. Kolumny bierze z `information_schema` (klucze obce do `Persons`),
 * więc nowa tabela z kluczem obcym wchodzi do inwentarza sama, bez zmiany kodu.
 */
export default class PersonReferencesRepository {
    async findReferenceColumns(): Promise<PersonReferenceColumn[]> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND LOWER(REFERENCED_TABLE_NAME) = 'persons'
             ORDER BY TABLE_NAME, COLUMN_NAME`,
        )) as { tableName: string; columnName: string }[];
        const discovered = (Array.isArray(rows) ? rows : []).map((row) => ({
            table: String(row.tableName),
            column: String(row.columnName),
        }));
        return mergeReferenceColumns(discovered);
    }

    /** Mapa: numer osoby -> odwołania (tylko niezerowe). Osoba bez odwołań nie ma wpisu. */
    async countReferences(
        personIds: number[],
        columns?: PersonReferenceColumn[],
    ): Promise<Map<number, PersonReferenceCount[]>> {
        const result = new Map<number, PersonReferenceCount[]>();
        if (!personIds.length) return result;
        const cols = columns ?? (await this.findReferenceColumns());
        if (!cols.length) return result;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            buildReferenceCountsSql(cols, personIds),
        )) as { ref: string; personId: number; n: number }[];
        for (const row of Array.isArray(rows) ? rows : []) {
            const personId = Number(row.personId);
            const list = result.get(personId) ?? [];
            list.push({ ref: String(row.ref), count: Number(row.n) });
            result.set(personId, list);
        }
        for (const list of result.values())
            list.sort((a, b) => a.ref.localeCompare(b.ref));
        return result;
    }
}
