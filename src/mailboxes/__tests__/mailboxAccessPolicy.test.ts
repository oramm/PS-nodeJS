import { describe, expect, it } from '@jest/globals';
import { MembershipEdge } from '../../persons/projectAssignments/projectMembership';
import { MailboxOwnerRow, mailboxAssigneeRows, personMailboxes } from '../mailboxAccessPolicy';
import { expectedSecretNames, SB_SECRET_AGENT_MAIL } from '../../sbAccess/sbSecretsPolicy';

// Skrzynka projektu i kontraktu domyślnie z hasłem od PS (wersja 1), ogólnofirmowa - bez.
const box = (code: string, projectOurId: string | null, contractId: number | null = null, allEmployees = false,
    passwordVersion: number | null = projectOurId ? 1 : null): MailboxOwnerRow => ({
    code, address: `${code}@envi.com.pl`, projectOurId, contractId, allEmployees, passwordVersion,
});
const edge = (projectOurId: string, contractId: number | null, personId: number): MembershipEdge => ({ projectOurId, contractId, personId });
// projekt A: kontrakt 11 (kierownik 1, admin 2), kontrakt 12 (kierownik 3, admin 2, osobna skrzynka); projekt B: kontrakt 21 (kierownik 1)
const edges = [edge('A', 11, 1), edge('A', 11, 2), edge('A', 12, 3), edge('A', 12, 2), edge('B', 21, 1)];
// faktury = ogólnofirmowa wskazanych osób (K3), biuro = ogólnofirmowa "wszyscy pracownicy"
const mailboxes = [box('proj-a', 'A'), box('kontr-12', 'A', 12), box('proj-b', 'B'), box('faktury', null), box('biuro', null, null, true)];
const codes = (personId: number, role: string, e = edges, manual: string[] = []) =>
    personMailboxes(personId, mailboxAssigneeRows(mailboxes, e), manual, role).map((m) => m.code);

describe('mailboxAssigneeRows (reguła projectMembership)', () => {
    it('skrzynka projektu = osoby każdego kontraktu; skrzynka kontraktu = tylko jego osoby; ogólnofirmowa = nikt', () => {
        const rows = mailboxAssigneeRows(mailboxes, edges);
        expect(rows.filter((r) => r.code === 'proj-a').map((r) => r.personId)).toEqual([1, 2, 3]);
        expect(rows.filter((r) => r.code === 'kontr-12').map((r) => r.personId)).toEqual([3, 2]);
        expect(rows.filter((r) => r.code === 'faktury')).toEqual([
            { code: 'faktury', address: 'faktury@envi.com.pl', personId: null, owned: false, allEmployees: false, passwordVersion: null },
        ]);
        expect(rows.find((r) => r.code === 'biuro')).toMatchObject({ owned: false, allEmployees: true });
    });

    it('przypisanie do projektu (PersonProjects) daje skrzynkę projektu i skrzynki jego kontraktów', () => {
        const rows = mailboxAssigneeRows(mailboxes, [...edges, edge('A', null, 9)]);
        expect(rows.filter((r) => r.personId === 9).map((r) => r.code)).toEqual(['proj-a', 'kontr-12']);
    });
});

describe('personMailboxes (reguła MBX-2 na przynależności DOSTEP-2)', () => {
    it('osoba w dwóch projektach ma obie skrzynki z przypisań', () => {
        expect(personMailboxes(1, mailboxAssigneeRows(mailboxes, edges), [], 'ENVI_COOPERATOR')).toEqual([
            { code: 'proj-a', address: 'proj-a@envi.com.pl', source: 'assignment' },
            { code: 'proj-b', address: 'proj-b@envi.com.pl', source: 'assignment' },
        ]);
    });

    it('administrator obu kontraktów ma skrzynkę projektu i osobną skrzynkę kontraktu 12', () => {
        expect(codes(2, 'ENVI_COOPERATOR')).toEqual(['kontr-12', 'proj-a']);
    });

    it('odebrane przypisanie = brak skrzynki (reguła liczy z bieżących danych)', () => {
        expect(codes(1, 'ENVI_COOPERATOR', edges.filter((e) => e.personId !== 1))).toEqual([]);
    });

    it('wyjątek ręczny działa bez przypisania; przy przypisaniu źródło = both', () => {
        expect(personMailboxes(9, mailboxAssigneeRows(mailboxes, edges), ['faktury'], 'ENVI_COOPERATOR')).toEqual([
            { code: 'faktury', address: 'faktury@envi.com.pl', source: 'manual' },
        ]);
        expect(personMailboxes(1, mailboxAssigneeRows(mailboxes, edges), ['proj-a'], 'ENVI_COOPERATOR')
            .find((m) => m.code === 'proj-a')?.source).toBe('both');
    });

    it('kod ręczny spoza spisu jest pomijany; obcy nie dostaje niczego', () => {
        expect(codes(9, 'ENVI_COOPERATOR', edges, ['marek'])).toEqual([]);
    });

    it.each(['CONTRACT_WORKER', 'CLIENT'])('%s nie dostaje skrzynek z żadnej drogi przypisania ani z roli (MBX, SKO K1)', (role) => {
        const assigned = [...edges, edge('A', 11, 9), edge('B', null, 9)];
        expect(codes(9, role, assigned)).toEqual([]);
        expect(codes(9, role, assigned, ['proj-a'])).toEqual(['proj-a']);
    });

    it('współpracownik przypisany do projektu albo kontraktu ma ich pocztę (DOSTEP, D7); nieprzypisany - nic, także bez "wszyscy pracownicy"', () => {
        expect(codes(9, 'ENVI_COOPERATOR', [...edges, edge('B', null, 9)])).toEqual(['proj-b']);
        expect(codes(9, 'ENVI_COOPERATOR', [...edges, edge('A', 12, 9)])).toEqual(['kontr-12', 'proj-a']);
        expect(codes(9, 'ENVI_COOPERATOR')).toEqual([]);
    });

    it('użytkownik zewnętrzny jak przed SKO: tylko skrzynki przypisań, bez roli', () => {
        expect(codes(9, 'EXTERNAL_USER')).toEqual([]);
        expect(codes(9, 'EXTERNAL_USER', [...edges, edge('B', null, 9)])).toEqual(['proj-b']);
    });

    it.each(['ENVI_EMPLOYEE', 'ENVI_MANAGER', 'ADMIN'])('%s ma każdą skrzynkę projektu i kontraktu oraz ogólnofirmową "wszyscy" (SKO K1)', (role) => {
        expect(codes(9, role)).toEqual(['biuro', 'kontr-12', 'proj-a', 'proj-b']);
        expect(codes(9, role, [])).toEqual(['biuro', 'kontr-12', 'proj-a', 'proj-b']);
    });

    it('skrzynka projektu bez hasła od PS (przed przejęciem) jak przed SKO: pracownik bez przypisania jej nie ma i nie ma konta technicznego', () => {
        // chc = skrzynka kontraktu 21 (projekt B) z kopią dla agenta, hasło ręczne; proj-a zarządzana przez PS
        const boxes = [box('proj-a', 'A'), box('chc', 'B', 21, false, null)];
        const registry = [{ code: 'proj-a', projectId: 1, contractId: null, passwordVersion: 1 }, { code: 'chc', projectId: null, contractId: 21, passwordVersion: null }];
        const levels = { repos: 'none', psDb: 'none', drive: 'none', mail: [] } as any;
        const of = (personId: number, manual: string[] = []) => personMailboxes(personId, mailboxAssigneeRows(boxes, edges), manual, 'ENVI_EMPLOYEE');
        expect(of(9).map((m) => m.code)).toEqual(['proj-a']);
        expect(expectedSecretNames(levels, of(9), registry)).toEqual(['poczta-proj-a']);
        // przypisany (kierownik kontraktu 21) albo wyjątek ręczny - jak przed SKO, przez konto techniczne
        expect(of(1).map((m) => [m.code, m.source])).toEqual([['chc', 'assignment'], ['proj-a', 'assignment']]);
        expect(expectedSecretNames(levels, of(1), registry)).toEqual(['poczta-proj-a', SB_SECRET_AGENT_MAIL]);
        expect(of(9, ['chc']).find((m) => m.code === 'chc')?.source).toBe('manual');
    });

    it('faktury@ (ogólnofirmowa wskazanych osób) tylko z wyjątku ręcznego, także dla pracownika', () => {
        expect(codes(9, 'ENVI_EMPLOYEE')).not.toContain('faktury');
        expect(codes(9, 'ENVI_EMPLOYEE', edges, ['faktury'])).toContain('faktury');
    });

    it('źródło: przypisanie zostaje przypisaniem także dla pracownika; reszta z roli = role', () => {
        const sources = Object.fromEntries(personMailboxes(1, mailboxAssigneeRows(mailboxes, edges), ['proj-b', 'faktury'], 'ENVI_EMPLOYEE')
            .map((m) => [m.code, m.source]));
        expect(sources).toEqual({ biuro: 'role', faktury: 'manual', 'kontr-12': 'role', 'proj-a': 'assignment', 'proj-b': 'both' });
    });
});
