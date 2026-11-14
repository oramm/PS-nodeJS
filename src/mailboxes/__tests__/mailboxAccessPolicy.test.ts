import { describe, expect, it } from '@jest/globals';
import { MembershipEdge } from '../../persons/projectAssignments/projectMembership';
import { MailboxOwnerRow, mailboxAssigneeRows, personMailboxes } from '../mailboxAccessPolicy';

const box = (code: string, projectOurId: string | null, contractId: number | null = null): MailboxOwnerRow => ({
    code, address: `${code}@envi.com.pl`, projectOurId, contractId,
});
const edge = (projectOurId: string, contractId: number | null, personId: number): MembershipEdge => ({ projectOurId, contractId, personId });
// projekt A: kontrakt 11 (kierownik 1, admin 2), kontrakt 12 (kierownik 3, admin 2, osobna skrzynka); projekt B: kontrakt 21 (kierownik 1)
const edges = [edge('A', 11, 1), edge('A', 11, 2), edge('A', 12, 3), edge('A', 12, 2), edge('B', 21, 1)];
const mailboxes = [box('proj-a', 'A'), box('kontr-12', 'A', 12), box('proj-b', 'B'), box('faktury', null)];
const codes = (personId: number, role: string, e = edges, manual: string[] = []) =>
    personMailboxes(personId, mailboxAssigneeRows(mailboxes, e), manual, role).map((m) => m.code);

describe('mailboxAssigneeRows (reguła projectMembership)', () => {
    it('skrzynka projektu = osoby każdego kontraktu; skrzynka kontraktu = tylko jego osoby; ogólnofirmowa = nikt', () => {
        const rows = mailboxAssigneeRows(mailboxes, edges);
        expect(rows.filter((r) => r.code === 'proj-a').map((r) => r.personId)).toEqual([1, 2, 3]);
        expect(rows.filter((r) => r.code === 'kontr-12').map((r) => r.personId)).toEqual([3, 2]);
        expect(rows.filter((r) => r.code === 'faktury')).toEqual([{ code: 'faktury', address: 'faktury@envi.com.pl', personId: null }]);
    });

    it('przypisanie do projektu (PersonProjects) daje skrzynkę projektu i skrzynki jego kontraktów', () => {
        const rows = mailboxAssigneeRows(mailboxes, [...edges, edge('A', null, 9)]);
        expect(rows.filter((r) => r.personId === 9).map((r) => r.code)).toEqual(['proj-a', 'kontr-12']);
    });
});

describe('personMailboxes (reguła MBX-2 na przynależności DOSTEP-2)', () => {
    it('osoba w dwóch projektach ma obie skrzynki z przypisań', () => {
        expect(personMailboxes(1, mailboxAssigneeRows(mailboxes, edges), [], 'ENVI_EMPLOYEE')).toEqual([
            { code: 'proj-a', address: 'proj-a@envi.com.pl', source: 'assignment' },
            { code: 'proj-b', address: 'proj-b@envi.com.pl', source: 'assignment' },
        ]);
    });

    it('administrator obu kontraktów ma skrzynkę projektu i osobną skrzynkę kontraktu 12', () => {
        expect(codes(2, 'ENVI_EMPLOYEE')).toEqual(['kontr-12', 'proj-a']);
    });

    it('odebrane przypisanie = brak skrzynki (reguła liczy z bieżących danych)', () => {
        expect(codes(1, 'ENVI_EMPLOYEE', edges.filter((e) => e.personId !== 1))).toEqual([]);
    });

    it('wyjątek ręczny działa bez przypisania; przy przypisaniu źródło = both', () => {
        expect(personMailboxes(9, mailboxAssigneeRows(mailboxes, edges), ['faktury'], 'ENVI_EMPLOYEE')).toEqual([
            { code: 'faktury', address: 'faktury@envi.com.pl', source: 'manual' },
        ]);
        expect(personMailboxes(1, mailboxAssigneeRows(mailboxes, edges), ['proj-a'], 'ENVI_EMPLOYEE')
            .find((m) => m.code === 'proj-a')?.source).toBe('both');
    });

    it('kod ręczny spoza spisu jest pomijany; obcy nie dostaje niczego', () => {
        expect(codes(9, 'ENVI_EMPLOYEE', edges, ['marek'])).toEqual([]);
    });

    it.each(['CONTRACT_WORKER', 'CLIENT'])('%s nie dostaje skrzynek z żadnej drogi przypisania (MBX)', (role) => {
        const assigned = [...edges, edge('A', 11, 9), edge('B', null, 9)];
        expect(codes(9, role, assigned)).toEqual([]);
        expect(codes(9, role, assigned, ['proj-a'])).toEqual(['proj-a']);
    });

    it('współpracownik przypisany do projektu albo kontraktu ma ich pocztę (DOSTEP, D7)', () => {
        expect(codes(9, 'ENVI_COOPERATOR', [...edges, edge('B', null, 9)])).toEqual(['proj-b']);
        expect(codes(9, 'ENVI_COOPERATOR', [...edges, edge('A', 12, 9)])).toEqual(['kontr-12', 'proj-a']);
    });
});
