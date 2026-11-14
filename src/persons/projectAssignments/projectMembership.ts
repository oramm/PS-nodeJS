/**
 * JEDYNE miejsce reguły "kto należy do projektu i kontraktu" (plan DOSTEP, DOSTEP-2; uogólnia MBX D2).
 *
 * Przypisanie to jedna z czterech dróg, wszystkie równorzędne:
 * - kierownik albo administrator umowy ENVI (OurContractsData.ManagerId / AdminId) - kontrakt,
 * - osoba dodatkowa kontraktu (ContractSelectedPersons) - kontrakt,
 * - przypisanie do projektu (PersonProjects) - projekt, czyli każdy jego kontrakt.
 * SQL tych dróg jest w ProjectAssignmentRepository.findMembership; tu tylko czyste funkcje.
 *
 * Z przynależności korzystają trzy miejsca i każde rozstrzyga tylko, co z niej wynika dla roli:
 * zakres danych ról ograniczonych (projectScopedPolicy), poczta (mailboxAccessPolicy - bez
 * pracownika kontraktowego i klienta, MBX) i pokoje Google Chat (ChatSpacesController).
 * Persons_Contracts (pisma użytkownika zewnętrznego) celowo nie jest tu drogą - patrz LetterRepository.
 */
export interface MembershipEdge {
    projectOurId: string;
    /** null = przypisanie do całego projektu (PersonProjects). */
    contractId: number | null;
    personId: number;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** Osoby projektu: przypisane do niego albo do któregokolwiek jego kontraktu. */
export function projectMemberIds(edges: MembershipEdge[], projectOurId: string): number[] {
    return unique(edges.filter((e) => e.projectOurId === projectOurId).map((e) => e.personId));
}

/** Osoby kontraktu: przypisane do niego albo do całego jego projektu. */
export function contractMemberIds(edges: MembershipEdge[], contractId: number, projectOurId: string): number[] {
    return unique(edges
        .filter((e) => e.contractId === contractId || (e.contractId === null && e.projectOurId === projectOurId))
        .map((e) => e.personId));
}

/** Projekty osoby - zakres danych ról ograniczonych. */
export function memberProjectOurIds(edges: MembershipEdge[], personId: number): string[] {
    return unique(edges.filter((e) => e.personId === personId).map((e) => e.projectOurId)).sort();
}
