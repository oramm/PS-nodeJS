/**
 * DOSTEP-7: przegląd dostępów mówi to samo, co serwer robi z żądaniem.
 * Przykłady: pracownik ENVI, współpracownik z projektem i bez, rola tylko w kontrakcie,
 * pracownik kontraktowy (bez poczty i pokoju), użytkownik zewnętrzny (pisma po kontraktach), skrzynka dodana ręcznie.
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');
jest.mock('../../../setup/Sessions/ToolsChat');
jest.mock('../../../tools/ToolsMail');

import { SystemRoleName } from '../../../types/sessionTypes';
import { MembershipEdge } from '../../projectAssignments/projectMembership';
import { AccessArea, personAccess, PersonAccessInput } from '../personAccess';

const edge = (projectOurId: string, contractId: number | null, personId: number): MembershipEdge => ({ projectOurId, contractId, personId });
const base = (personId: number, role: SystemRoleName, edges: MembershipEdge[], extra: Partial<PersonAccessInput> = {}): PersonAccessInput => ({
    personId,
    role,
    edges,
    letterContracts: [],
    // skrzynka projektu A z hasłem od PS (SKO K1); kto do niej należy, liczy reguła z krawędzi (jak po zapisie formularza)
    mailboxes: [{ code: 'a', address: 'a@envi.com.pl', projectOurId: 'A', contractId: null, createdByPersonId: null, passwordVersion: 1 }],
    manualMailCodes: [],
    managesSb: false,
    spaceRows: [{ spaceId: 1, googleName: 'spaces/x', spaceProjectOurId: 'A', createdByPersonId: null, contractId: null, contractProjectOurId: null }],
    ...extra,
});
const area = (input: PersonAccessInput, key: AccessArea) => personAccess(input).find((a) => a.area === key)!;

describe('personAccess', () => {
    it('pracownik ENVI widzi wszystkie projekty, oferty, faktury i skrzynki projektów z roli (SKO K1)', () => {
        const input = base(1, SystemRoleName.ENVI_EMPLOYEE, []);
        expect(area(input, 'projects')).toMatchObject({ sees: true, value: 'wszystkie', source: 'rola' });
        expect(area(input, 'offers')).toMatchObject({ sees: true, source: 'rola' });
        expect(area(input, 'salesInvoices')).toMatchObject({ sees: true, source: 'rola' });
        expect(area(input, 'mail')).toMatchObject({ sees: true, value: '1 skrzynka', source: 'rola' });
        expect(area(base(1, SystemRoleName.ENVI_EMPLOYEE, [edge('A', 11, 1)]), 'mail')).toMatchObject({ sees: true, source: 'przypisanie' });
    });

    it('współpracownik z przypisaniem do projektu: dane, pisma, poczta i pokój tego projektu; bez ofert i faktur', () => {
        const input = base(2, SystemRoleName.ENVI_COOPERATOR, [edge('A', null, 2)]);
        expect(area(input, 'projects')).toMatchObject({ sees: true, value: '1 projekt', source: 'przypisanie' });
        expect(area(input, 'letters')).toMatchObject({ sees: true, source: 'przypisanie' });
        expect(area(input, 'mail')).toMatchObject({ sees: true, value: '1 skrzynka', source: 'przypisanie' });
        expect(area(input, 'chat')).toMatchObject({ sees: true, value: '1 pokój', source: 'przypisanie' });
        expect(area(input, 'offers').sees).toBe(false);
        expect(area(input, 'salesInvoices').sees).toBe(false);
    });

    it('współpracownik bez przypisania widzi pusty system', () => {
        const projects = area(base(3, SystemRoleName.ENVI_COOPERATOR, []), 'projects');
        expect(projects.sees).toBe(false);
        expect(projects.why).toContain('nie widzi danych żadnego projektu');
    });

    it('rola tylko w kontrakcie daje współpracownikowi pocztę i pokój, ale nie dane projektu', () => {
        const input = base(4, SystemRoleName.ENVI_COOPERATOR, [edge('A', 11, 4)]);
        expect(area(input, 'projects').sees).toBe(false);
        expect(area(input, 'projects').why).toContain('nie otwiera danych projektu');
        expect(area(input, 'mail').sees).toBe(true);
        expect(area(input, 'chat').sees).toBe(true);
    });

    it('pracownik kontraktowy: dane przypisanego projektu, bez poczty i pokoju', () => {
        const input = base(5, SystemRoleName.CONTRACT_WORKER, [edge('A', null, 5)]);
        expect(area(input, 'projects').sees).toBe(true);
        expect(area(input, 'mail').sees).toBe(false);
        expect(area(input, 'chat').sees).toBe(false);
    });

    it('użytkownik zewnętrzny: bez projektów, pisma tylko przypisanych kontraktów', () => {
        const without = base(6, SystemRoleName.EXTERNAL_USER, []);
        expect(area(without, 'projects').sees).toBe(false);
        expect(area(without, 'letters').sees).toBe(false);
        const withContract = base(6, SystemRoleName.EXTERNAL_USER, [], { letterContracts: [{ personId: 6, contractId: 9, label: 'K-9' }] });
        expect(area(withContract, 'letters')).toMatchObject({ sees: true, value: '1 kontrakt', source: 'przypisanie' });
        expect(area(withContract, 'mail').sees).toBe(false);
    });

    it('skrzynka dodana ręcznie bez przypisania to wyjątek', () => {
        const input = base(7, SystemRoleName.ENVI_EMPLOYEE, [], {
            mailboxes: [{ code: 'b', address: 'b@envi.com.pl', projectOurId: null, contractId: null, createdByPersonId: null }],
            manualMailCodes: ['b'],
        });
        expect(area(input, 'mail')).toMatchObject({ sees: true, source: 'wyjątek' });
        // ręczny wyjątek działa też dla roli bez poczty z przypisania (SB dostarcza hasło niezależnie od roli)
        expect(area({ ...input, role: SystemRoleName.CONTRACT_WORKER }, 'mail').sees).toBe(true);
    });

    it('poczta idzie za krawędziami z wejścia - podgląd z formularza dodaje i zabiera skrzynkę', () => {
        expect(area(base(8, SystemRoleName.ENVI_COOPERATOR, []), 'mail').sees).toBe(false);
        expect(area(base(8, SystemRoleName.ENVI_COOPERATOR, [edge('A', null, 8)]), 'mail').sees).toBe(true);
    });

    it('zarządzający dostępem SB ma każdą skrzynkę, zakładający ma swoją', () => {
        expect(area(base(9, SystemRoleName.ENVI_MANAGER, [], { managesSb: true }), 'mail')).toMatchObject({ sees: true, source: 'wyjątek' });
        const creator = base(9, SystemRoleName.ENVI_COOPERATOR, [], {
            mailboxes: [{ code: 'a', address: 'a@envi.com.pl', projectOurId: 'A', contractId: null, createdByPersonId: 9 }],
        });
        expect(area(creator, 'mail')).toMatchObject({ sees: true, value: '1 skrzynka', source: 'wyjątek' });
        expect(area({ ...creator, role: SystemRoleName.CLIENT }, 'mail').sees).toBe(false);
    });
});

describe('przegląd faktur sprzedaży przy włączonym filtrze', () => {
    const flag = process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES;
    beforeEach(() => { process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES = 'true'; });
    afterEach(() => {
        if (flag === undefined) delete process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES;
        else process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES = flag;
    });
    it('rola w kontrakcie daje faktury tylko z przypisania', () => {
        const result = area(base(1, SystemRoleName.ENVI_EMPLOYEE, [edge('A', 11, 1)]), 'salesInvoices');
        expect(result).toMatchObject({ sees: true, source: 'przypisanie' });
        expect(result.why).toContain('kontrakty: 11');
    });
    it('przypisanie do projektu daje faktury kontraktów projektu', () => {
        expect(area(base(1, SystemRoleName.ENVI_EMPLOYEE, [edge('A', null, 1)]), 'salesInvoices').why).toContain('projekty: A');
    });
    it('bez członkostwa nie ma faktur', () => {
        expect(area(base(1, SystemRoleName.ENVI_EMPLOYEE, []), 'salesInvoices').sees).toBe(false);
    });
    it('kierownik nadal widzi wszystkie faktury', () => {
        expect(area(base(1, SystemRoleName.ENVI_MANAGER, []), 'salesInvoices')).toMatchObject({ sees: true, value: 'wszystkie', source: 'rola' });
    });
});
