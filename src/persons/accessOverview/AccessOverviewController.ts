import AccessOverviewRepository, { AccessContext, AccessPersonRow } from './AccessOverviewRepository';
import { AreaAccess, personAccess } from './personAccess';
import ProjectAssignmentRepository from '../projectAssignments/ProjectAssignmentRepository';
import { BadRequestError } from '../projectAssignments/ProjectScopeGuard';
import { SB_MANAGER_ROLES } from '../../sbAccess/sbAccessPolicy';

export interface PersonAccessView extends AccessPersonRow {
    /** Przypisania do projektu (PersonProjects) - to jedyne, które ekran pozwala odebrać. */
    assignments: { ourId: string; name: string }[];
    /** Kontrakty, w których osoba ma rolę (kierownik, administrator umowy, osoba dodatkowa). */
    contractRoles: { projectOurId: string; contractId: number }[];
    /** Kontrakty z Persons_Contracts (pisma użytkownika zewnętrznego). */
    letterContracts: string[];
    areas: AreaAccess[];
}

function view(person: AccessPersonRow, ctx: AccessContext): PersonAccessView {
    const edges = ctx.edges.filter((e) => e.personId === person.personId);
    return {
        ...person,
        assignments: edges.filter((e) => e.contractId === null)
            .map((e) => ({ ourId: e.projectOurId, name: ctx.projectNames.get(e.projectOurId) ?? '' }))
            .sort((a, b) => a.ourId.localeCompare(b.ourId)),
        contractRoles: edges.filter((e) => e.contractId !== null).map((e) => ({ projectOurId: e.projectOurId, contractId: e.contractId as number })),
        letterContracts: ctx.letterContracts.filter((c) => c.personId === person.personId).map((c) => c.label),
        areas: personAccess({
            personId: person.personId,
            role: person.role,
            edges,
            letterContracts: ctx.letterContracts,
            mailboxes: ctx.mailboxes,
            manualMailCodes: ctx.manualMailCodes.get(person.personId) ?? [],
            spaceRows: ctx.spaceRows,
            managesSb: person.managesSb,
        }),
    };
}

/** Przegląd "kto ma do czego dostęp i skąd" (DOSTEP-7). Tylko odczyt. */
export default class AccessOverviewController {
    static async list(): Promise<PersonAccessView[]> {
        const [persons, ctx] = await Promise.all([AccessOverviewRepository.findPersons(), AccessOverviewRepository.loadContext()]);
        return persons.map((p) => view(p, ctx));
    }

    static async get(personId: number): Promise<PersonAccessView | null> {
        const [person] = await AccessOverviewRepository.findPersons(personId);
        return person ? view(person, await AccessOverviewRepository.loadContext(personId)) : null;
    }

    /**
     * Podgląd przed zapisem: te same reguły na roli i przypisaniach z formularza zamiast zapisanych.
     * Role w kontraktach i Persons_Contracts zostają z bazy - formularz ich nie zmienia. personId 0 = nowa osoba (bez przypisań).
     */
    static async preview(personId: number, systemRoleId: number, projectOurIds: string[]): Promise<AreaAccess[]> {
        const role = await AccessOverviewRepository.roleNameById(systemRoleId);
        if (!role) throw new BadRequestError('Nieznana rola');
        const existing = await ProjectAssignmentRepository.filterExistingProjectOurIds(projectOurIds);
        const unknown = projectOurIds.filter((id) => !existing.includes(id));
        if (unknown.length) throw new BadRequestError(`Nieznane projekty: ${unknown.join(', ')}`);
        const [ctx, [saved]] = await Promise.all([
            AccessOverviewRepository.loadContext(personId),
            personId ? AccessOverviewRepository.findPersons(personId) : Promise.resolve([]),
        ]);
        ctx.edges = [
            ...ctx.edges.filter((e) => e.personId === personId && e.contractId !== null),
            ...projectOurIds.map((projectOurId) => ({ projectOurId, contractId: null, personId })),
        ];
        // Znacznik SB zostaje z bazy, ale działa tylko przy roli kierowniczej - tak jak canManage.
        const managesSb = !!saved?.managesSb && SB_MANAGER_ROLES.includes(role);
        return view({ personId, name: '', surname: '', entityName: null, systemRoleId, role, managesSb }, ctx).areas;
    }
}
