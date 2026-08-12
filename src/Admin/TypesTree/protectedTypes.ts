import Setup from '../../setup/Setup';

/**
 * Typy, do których kod odwołuje się na sztywno.
 *
 * Listy są WYPROWADZANE z Setup, a nie przepisane obok - inaczej dodanie nowej
 * stałej w Setup zostawiłoby tu cichą lukę i panel pozwoliłby zmienić nazwę,
 * na której coś się opiera.
 */

/** Typy kamieni rozpoznawane po identyfikatorze (Setup.MilestoneTypes). */
export const PROTECTED_MILESTONE_TYPE_IDS: number[] = Object.values(
    Setup.MilestoneTypes
);

/** Typy spraw rozpoznawane po identyfikatorze (Setup.CaseTypes). */
export const PROTECTED_CASE_TYPE_IDS: number[] = Object.values(Setup.CaseTypes);

/**
 * Typy spraw rozpoznawane po NAZWIE. To groźniejszy przypadek niż numer:
 * zmiana nazwy nie wywala błędu, tylko po cichu rozspójnia moduł.
 * Dziś jedyny taki typ to koszyk ofert (OffersController).
 */
export const PROTECTED_CASE_TYPE_NAMES: string[] = [
    Setup.ScrumBoard.bucketCaseTypeName,
];

export function isMilestoneTypeNameLocked(id: number | undefined): boolean {
    return id !== undefined && PROTECTED_MILESTONE_TYPE_IDS.includes(id);
}

export function isCaseTypeNameLocked(
    id: number | undefined,
    name: string | undefined
): boolean {
    if (id !== undefined && PROTECTED_CASE_TYPE_IDS.includes(id)) return true;
    return !!name && PROTECTED_CASE_TYPE_NAMES.includes(name);
}
