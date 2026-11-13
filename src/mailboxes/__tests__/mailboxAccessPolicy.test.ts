import { describe, expect, it } from '@jest/globals';
import { contractAssigneeIds } from '../../contracts/contractAssignees';
import { MailboxAssigneeRow, personMailboxes } from '../mailboxAccessPolicy';

const row = (code: string, managerId: number | null, adminId: number | null): MailboxAssigneeRow => ({
    code, address: `${code}@envi.com.pl`, managerId, adminId,
});
// projekt A (2 kontrakty: kierownik 1/admin 2 oraz kierownik 3/admin 2), projekt B (kierownik 1), ogólnofirmowa
const rows = [row('proj-a', 1, 2), row('proj-a', 3, 2), row('proj-b', 1, null), row('faktury', null, null)];

describe('contractAssigneeIds', () => {
    it('kierownik, administrator i dodatkowi bez pustych i duplikatów', () => {
        expect(contractAssigneeIds(1, 1, 2, null, 0)).toEqual([1, 2]);
    });
});

describe('personMailboxes (reguła MBX-2)', () => {
    it('osoba w dwóch projektach ma obie skrzynki z przypisań', () => {
        expect(personMailboxes(1, rows, [])).toEqual([
            { code: 'proj-a', address: 'proj-a@envi.com.pl', source: 'assignment' },
            { code: 'proj-b', address: 'proj-b@envi.com.pl', source: 'assignment' },
        ]);
    });

    it('administrator jednego z kontraktów projektu widzi skrzynkę projektu; kierownik drugiego kontraktu też', () => {
        expect(personMailboxes(2, rows, []).map((m) => m.code)).toEqual(['proj-a']);
        expect(personMailboxes(3, rows, []).map((m) => m.code)).toEqual(['proj-a']);
    });

    it('odebrane przypisanie = brak skrzynki (reguła liczy z bieżących danych)', () => {
        const after = [row('proj-a', null, 2), row('proj-a', 3, 2), row('proj-b', null, null)];
        expect(personMailboxes(1, after, [])).toEqual([]);
    });

    it('wyjątek ręczny działa bez przypisania; przy przypisaniu źródło = both', () => {
        expect(personMailboxes(9, rows, ['faktury'])).toEqual([
            { code: 'faktury', address: 'faktury@envi.com.pl', source: 'manual' },
        ]);
        expect(personMailboxes(1, rows, ['proj-a']).find((m) => m.code === 'proj-a')?.source).toBe('both');
    });

    it('kod ręczny spoza spisu jest pomijany; obcy nie dostaje niczego', () => {
        expect(personMailboxes(9, rows, ['marek'])).toEqual([]);
    });
});
