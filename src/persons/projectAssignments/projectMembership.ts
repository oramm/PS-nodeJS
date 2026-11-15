/**
 * JEDYNE miejsce reguły "kto należy do projektu i kontraktu" (plan DOSTEP, DOSTEP-2; uogólnia MBX D2).
 *
 * Przypisanie to jedna z czterech dróg:
 * - kierownik albo administrator umowy ENVI (OurContractsData.ManagerId / AdminId) - kontrakt,
 * - osoba dodatkowa kontraktu (ContractSelectedPersons) - kontrakt,
 * - przypisanie do projektu (PersonProjects) - projekt, czyli każdy jego kontrakt.
 * SQL tych dróg jest w ProjectAssignmentRepository.findMembership; tu tylko czyste funkcje.
 *
 * Co daje droga przypisania:
 * - każda droga: pocztę (mailboxAccessPolicy - bez pracownika kontraktowego i klienta, MBX)
 *   i pokój Google Chat (ChatSpacesController - też bez nich);
 * - zakres danych ról ograniczonych (projectScopedPolicy) daje WYŁĄCZNIE przypisanie do projektu
 *   (dataScopeProjectOurIds) - rola w kontrakcie nie otwiera danych całego projektu (jak przed DOSTEP-2).
 * Persons_Contracts (pisma użytkownika zewnętrznego) celowo nie jest tu drogą - patrz LetterRepository.
 */
export interface MembershipEdge {
    projectOurId: string;
    /** null = przypisanie do całego projektu (PersonProjects). */
    contractId: number | null;
    personId: number;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export interface ContractScope {
    projectOurIds: string[];
    contractIds: number[];
}

/** Kontrakty osoby: role w konkretnych kontraktach oraz wszystkie kontrakty przypisanych projektów. */
export function personContractScope(edges: MembershipEdge[], personId: number): ContractScope {
    return {
        projectOurIds: dataScopeProjectOurIds(edges, personId),
        contractIds: unique(edges.filter((e) => e.personId === personId && e.contractId !== null)
            .map((e) => e.contractId as number)),
    };
}

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

/** Zakres danych roli ograniczonej: tylko projekty przypisane wprost (PersonProjects), nie przez kontrakt. */
export function dataScopeProjectOurIds(edges: MembershipEdge[], personId: number): string[] {
    return unique(edges.filter((e) => e.personId === personId && e.contractId === null).map((e) => e.projectOurId)).sort();
}
