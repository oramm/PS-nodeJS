/**
 * DOSTEP-2: jedna reguła przynależności do projektu i kontraktu - przykłady z planu
 * (osoba w dwóch projektach, odebrane przypisanie, przypisanie do kontraktu daje projekt).
 * Co z przynależności wynika dla poczty i pokoju, sprawdzają testy mailboxAccessPolicy i ChatSpacesController.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import ProjectAssignmentRepository from '../ProjectAssignmentRepository';
import { contractMemberIds, dataScopeProjectOurIds, MembershipEdge, projectMemberIds } from '../projectMembership';

const edge = (projectOurId: string, contractId: number | null, personId: number): MembershipEdge => ({ projectOurId, contractId, personId });
// 1 = kierownik kontraktu 11 w A i kontraktu 21 w B; 2 = osoba dodatkowa kontraktu 12 w A; 3 = PersonProjects w A
const edges = [edge('A', 11, 1), edge('A', 12, 2), edge('A', null, 3), edge('B', 21, 1)];

describe('projectMembership', () => {
    it('osoba w dwóch projektach ma oba w zakresie danych', () => {
        expect(dataScopeProjectOurIds([...edges, edge('B', null, 3)], 3)).toEqual(['A', 'B']);
    });

    it('rola w kontrakcie (kierownik, osoba dodatkowa) nie daje projektu w zakresie danych', () => {
        expect(dataScopeProjectOurIds(edges, 1)).toEqual([]);
        expect(dataScopeProjectOurIds(edges, 2)).toEqual([]);
        expect(dataScopeProjectOurIds(edges, 3)).toEqual(['A']);
    });

    it('odebrane przypisanie zabiera projekt', () => {
        expect(dataScopeProjectOurIds(edges.filter((e) => e.personId !== 3), 3)).toEqual([]);
    });

    it('osoby projektu = każdy kontrakt + PersonProjects; osoby kontraktu = ten kontrakt + PersonProjects', () => {
        expect(projectMemberIds(edges, 'A')).toEqual([1, 2, 3]);
        expect(contractMemberIds(edges, 11, 'A')).toEqual([1, 3]);
        expect(contractMemberIds(edges, 12, 'A')).toEqual([2, 3]);
    });
});

describe('ProjectAssignmentRepository.findMembership', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('czyta wszystkie cztery drogi i filtruje obie części tymi samymi parametrami', async () => {
        (ToolsDb.getQueryCallbackAsync as jest.Mock<any>).mockResolvedValue([
            { projectOurId: 'A', contractId: 11, personId: 1 }, { projectOurId: 'A', contractId: null, personId: '3' },
        ]);
        expect(await ProjectAssignmentRepository.findMembership({ projectOurIds: ['A'], personId: 1 }))
            .toEqual([edge('A', 11, 1), edge('A', null, 3)]);
        const [sql, , params] = (ToolsDb.getQueryCallbackAsync as jest.Mock<any>).mock.calls[0] as any[];
        for (const source of ['ManagerId', 'AdminId', 'ContractSelectedPersons', 'PersonProjects']) expect(sql).toContain(source);
        expect(params).toEqual([['A'], 1, ['A'], 1]);
    });

    it('pusta lista projektów nie pyta bazy', async () => {
        expect(await ProjectAssignmentRepository.findMembership({ projectOurIds: [] })).toEqual([]);
        expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('zakres danych osoby: tylko przypisanie do projektu, kontrakt w B go nie rozszerza', async () => {
        (ToolsDb.getQueryCallbackAsync as jest.Mock<any>).mockResolvedValue([
            { projectOurId: 'B', contractId: 21, personId: 7 }, { projectOurId: 'A', contractId: null, personId: 7 },
        ]);
        expect(await ProjectAssignmentRepository.getDataScopeProjectOurIds(7)).toEqual(['A']);
    });
});
