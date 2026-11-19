import { salesInvoicesScopedForRole } from '../../invoices/salesInvoiceScope';
import { SystemRoleName } from '../../types/sessionTypes';
import { dataScopeProjectOurIds, personContractScope, MembershipEdge } from '../projectAssignments/projectMembership';
import {
    CONTRACT_ASSIGNMENT_ROLES,
    PROJECT_SCOPED_ROLES,
    roleReachesRoute,
} from '../../setup/Sessions/projectScopedPolicy';
import { mailboxAssigneeRows, MailboxOwnerRow, NO_PROJECT_MAIL_ROLES, personMailboxes } from '../../mailboxes/mailboxAccessPolicy';
import { roomFromAssignment, spaceMemberIds } from '../../contracts/chatSpaces/ChatSpacesController';
import { SpaceContractRow } from '../../contracts/chatSpaces/ChatSpaceRepository';

/**
 * "Co ta osoba widzi i skąd" dla przeglądu dostępów (plan DOSTEP, DOSTEP-7).
 *
 * Tu NIE MA własnej reguły dostępu. Każdy obszar pyta o odpowiedź te same funkcje, które
 * rozstrzygają żądanie na serwerze: roleReachesRoute (lista tras ról zewnętrznych),
 * dataScopeProjectOurIds (zakres danych), mailboxAssigneeRows i personMailboxes (poczta; plus dwie furtki
 * MailboxController.assertAccess: zarządzający dostępem SB i zakładający skrzynkę), spaceMemberIds
 * i roomFromAssignment (pokój Google Chat). Gdy któraś z nich się zmieni, przegląd zmienia się razem z nią.
 * Wyjątki z powodem i terminem oraz obszary poufne celowo poza zakresem (czekają na decyzję właściciela).
 */
export type AccessArea = 'projects' | 'letters' | 'mail' | 'chat' | 'offers' | 'salesInvoices';
export type AccessSource = 'rola' | 'przypisanie' | 'wyjątek';

export interface AreaAccess {
    area: AccessArea;
    sees: boolean;
    /** Krótko: "wszystkie", "2 projekty", "—". */
    value: string;
    source: AccessSource | null;
    why: string;
}

export interface LetterContract {
    personId: number;
    contractId: number;
    /** Oznaczenie kontraktu do pokazania (numer albo OurId). */
    label: string;
}

export interface PersonAccessInput {
    personId: number;
    role: SystemRoleName;
    /** Przypisania wszystkimi drogami reguły projectMembership (wystarczą krawędzie tej osoby). */
    edges: MembershipEdge[];
    /** Persons_Contracts tej osoby - pisma użytkownika zewnętrznego (LetterRepository). */
    letterContracts: LetterContract[];
    /** Skrzynki z właścicielem; przypisanych do nich liczy się z `edges` (podgląd podmienia je na formularz). */
    mailboxes: (MailboxOwnerRow & { createdByPersonId: number | null })[];
    manualMailCodes: string[];
    /** Rola kierownicza ze znacznikiem zarządzania dostępem SB (SbAccessController.canManage) - każda skrzynka. */
    managesSb: boolean;
    spaceRows: SpaceContractRow[];
}

export const AREA_ORDER: AccessArea[] = ['projects', 'letters', 'mail', 'chat', 'offers', 'salesInvoices'];

const plural = (n: number, [one, few, many]: [string, string, string]) =>
    n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
const projects = (n: number) => `${n} ${plural(n, ['projekt', 'projekty', 'projektów'])}`;
const yes = (area: AccessArea, value: string, source: AccessSource, why: string): AreaAccess => ({ area, sees: true, value, source, why });
const no = (area: AccessArea, why: string): AreaAccess => ({ area, sees: false, value: '—', source: null, why });

export function personAccess(input: PersonAccessInput): AreaAccess[] {
    const { personId, role } = input;
    const edges = input.edges.filter((e) => e.personId === personId);
    const scoped = PROJECT_SCOPED_ROLES.includes(role);
    const byContracts = CONTRACT_ASSIGNMENT_ROLES.includes(role);
    const scope = dataScopeProjectOurIds(edges, personId);
    const contractRoleOnly = edges.some((e) => e.contractId !== null) && !scope.length
        ? ' Rola w kontrakcie (kierownik, administrator umowy, osoba dodatkowa) nie otwiera danych projektu.' : '';
    const emptyWhy = `Nie ma przypisania do żadnego projektu, więc nie widzi danych żadnego projektu.${contractRoleOnly}`;

    const projectsArea = (): AreaAccess => {
        if (!roleReachesRoute(role, 'POST', '/projects'))
            return no('projects', 'Ta rola nie widzi projektów, tylko pisma kontraktów, do których osoba jest przypisana.');
        if (!scoped) return yes('projects', 'wszystkie', 'rola', 'Pracownicy ENVI widzą dane wszystkich projektów.');
        return scope.length
            ? yes('projects', projects(scope.length), 'przypisanie', `Przypisanie do: ${scope.join(', ')}. Tylko dane tych projektów.`)
            : no('projects', emptyWhy);
    };

    const lettersArea = (): AreaAccess => {
        if (!roleReachesRoute(role, 'POST', '/contractsLetters')) return no('letters', 'Ta rola nie widzi pism.');
        if (byContracts) {
            const labels = input.letterContracts.filter((c) => c.personId === personId).map((c) => c.label);
            return labels.length
                ? yes('letters', `${labels.length} ${plural(labels.length, ['kontrakt', 'kontrakty', 'kontraktów'])}`, 'przypisanie',
                    `Przypisanie do kontraktów: ${labels.join(', ')}. Tylko pisma tych kontraktów.`)
                : no('letters', 'Nie jest przypisana do żadnego kontraktu, więc nie widzi żadnego pisma.');
        }
        if (!scoped) return yes('letters', 'wszystkie', 'rola', 'Pracownicy ENVI widzą pisma i dokumenty wszystkich projektów.');
        return scope.length
            ? yes('letters', projects(scope.length), 'przypisanie', `Pisma i dokumenty projektów: ${scope.join(', ')}.`)
            : no('letters', emptyWhy);
    };

    const mailArea = (): AreaAccess => {
        const count = (n: number) => `${n} ${plural(n, ['skrzynka', 'skrzynki', 'skrzynek'])}`;
        if (input.managesSb && input.mailboxes.length)
            return yes('mail', count(input.mailboxes.length), 'wyjątek', 'Zarządza dostępem do Second Brain, więc ma dostęp do każdej skrzynki.');
        const boxes = personMailboxes(personId, mailboxAssigneeRows(input.mailboxes, edges), input.manualMailCodes, role);
        const created = input.mailboxes.filter((m) => m.createdByPersonId === personId
            && !NO_PROJECT_MAIL_ROLES.includes(role) && !boxes.some((b) => b.code === m.code));
        if (!boxes.length && !created.length) return no('mail', NO_PROJECT_MAIL_ROLES.includes(role)
            ? 'Ta rola nie dostaje poczty z przypisania; skrzynkę może dostać tylko ręcznie w „Dostępie do Second Brain”.'
            : 'Nie jest przypisana do projektu ani kontraktu, który ma skrzynkę.');
        const assigned = boxes.filter((b) => b.source === 'assignment' || b.source === 'both');
        const byRole = boxes.filter((b) => b.source === 'role');
        const manual = boxes.filter((b) => b.source === 'manual');
        const why = [
            byRole.length ? `Z roli (pracownik ENVI ma każdą skrzynkę projektu i kontraktu oraz ogólnofirmowe dla wszystkich): ${byRole.map((b) => b.address).join(', ')}.` : '',
            assigned.length ? `Z przypisania: ${assigned.map((b) => b.address).join(', ')}.` : '',
            manual.length ? `Dodane ręcznie w „Dostępie do Second Brain”: ${manual.map((b) => b.address).join(', ')}.` : '',
            created.length ? `Założyła skrzynkę: ${created.map((m) => m.address).join(', ')}.` : '',
        ].filter(Boolean).join(' ');
        return yes('mail', count(boxes.length + created.length), byRole.length ? 'rola' : assigned.length ? 'przypisanie' : 'wyjątek', why);
    };

    const chatArea = (): AreaAccess => {
        const rooms = [...new Set(input.spaceRows.map((r) => r.spaceId))]
            .map((spaceId) => input.spaceRows.filter((r) => r.spaceId === spaceId))
            .filter((rows) => spaceMemberIds(rows, edges).includes(personId)
                && (roomFromAssignment(role) || rows[0].createdByPersonId === personId));
        if (!rooms.length)
            return no('chat', roomFromAssignment(role)
                ? 'Nie jest przypisana do projektu ani kontraktu, który ma pokój czatu.'
                : 'Ta rola nie dostaje pokoju czatu z przypisania.');
        const where = [...new Set(rooms.map((rows) => rows[0].spaceProjectOurId ?? rows.find((r) => r.contractProjectOurId)?.contractProjectOurId)
            .filter(Boolean))];
        return yes('chat', `${rooms.length} ${plural(rooms.length, ['pokój', 'pokoje', 'pokoi'])}`, 'przypisanie',
            `Pokój czatu idzie za przypisaniem${where.length ? `: ${where.join(', ')}` : ''}. To skład według przypisań; `
            + 'w Google może być inny (pracownika ENVI wyrównanie z pokoju nie usuwa, a sama zmiana roli składu nie wyrównuje).');
    };

    const staffOnly = (area: AccessArea, path: string, what: string): AreaAccess =>
        roleReachesRoute(role, 'POST', path)
            ? yes(area, 'wszystkie', 'rola', `${what} są dla pracowników ENVI.`)
            : no(area, `Ta rola nie widzi: ${what.toLowerCase()}.`);

    const salesInvoicesArea = (): AreaAccess => {
        if (!salesInvoicesScopedForRole(role)) return staffOnly('salesInvoices', '/invoices', 'Faktury sprzedaży');
        const contracts = personContractScope(edges, personId);
        if (!contracts.projectOurIds.length && !contracts.contractIds.length)
            return no('salesInvoices', 'Brak przypisania do projektu lub roli w kontrakcie, więc nie widzi faktur sprzedaży.');
        const where = [
            contracts.projectOurIds.length ? `projekty: ${contracts.projectOurIds.join(', ')}` : '',
            contracts.contractIds.length ? `kontrakty: ${contracts.contractIds.join(', ')}` : '',
        ].filter(Boolean).join('; ');
        return yes('salesInvoices', 'z przypisań', 'przypisanie',
            `Faktury sprzedaży tylko z kontraktów osoby (przypisanie do projektu albo rola w kontrakcie): ${where}.`);
    };

    return [
        projectsArea(),
        lettersArea(),
        mailArea(),
        chatArea(),
        staffOnly('offers', '/offers', 'Oferty'),
        salesInvoicesArea(),
    ];
}
