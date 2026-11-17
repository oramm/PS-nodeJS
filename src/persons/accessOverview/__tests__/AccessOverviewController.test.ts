/**
 * DOSTEP-7: podgląd przed zapisem liczy pocztę i dane z przypisań z formularza, nie z bazy
 * (znalezisko przeglądu niezależnego: wcześniej poczta brała przypisania z bazy).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');
jest.mock('../../../setup/Sessions/ToolsChat');
jest.mock('../../../tools/ToolsMail');
jest.mock('../AccessOverviewRepository');
jest.mock('../../projectAssignments/ProjectAssignmentRepository');

import AccessOverviewRepository from '../AccessOverviewRepository';
import ProjectAssignmentRepository from '../../projectAssignments/ProjectAssignmentRepository';
import AccessOverviewController from '../AccessOverviewController';
import { SystemRoleName } from '../../../types/sessionTypes';

const repo = AccessOverviewRepository as jest.Mocked<typeof AccessOverviewRepository>;
const assignments = ProjectAssignmentRepository as jest.Mocked<typeof ProjectAssignmentRepository>;

describe('AccessOverviewController.preview', () => {
    beforeEach(() => {
        repo.roleNameById.mockResolvedValue(SystemRoleName.ENVI_COOPERATOR);
        repo.findPersons.mockResolvedValue([]);
        assignments.filterExistingProjectOurIds.mockImplementation(async (ids: string[]) => ids);
        // W bazie osoba 8 jest przypisana do A (skrzynka A); formularz to zmienia.
        repo.loadContext.mockImplementation(async () => ({
            edges: [{ projectOurId: 'A', contractId: null, personId: 8 }],
            letterContracts: [],
            mailboxes: [{ code: 'a', address: 'a@envi.com.pl', projectOurId: 'A', contractId: null, createdByPersonId: null }],
            manualMailCodes: new Map(),
            spaceRows: [],
            projectNames: new Map(),
        }));
    });

    const mail = (areas: Awaited<ReturnType<typeof AccessOverviewController.preview>>) => areas.find((a) => a.area === 'mail')!;

    it('zdjęcie projektu w formularzu zabiera w podglądzie także pocztę', async () => {
        const areas = await AccessOverviewController.preview(8, 4, []);
        expect(mail(areas).sees).toBe(false);
        expect(areas.find((a) => a.area === 'projects')!.sees).toBe(false);
    });

    it('dodanie projektu w formularzu daje w podglądzie jego skrzynkę', async () => {
        repo.loadContext.mockImplementation(async () => ({
            edges: [],
            letterContracts: [],
            mailboxes: [{ code: 'a', address: 'a@envi.com.pl', projectOurId: 'A', contractId: null, createdByPersonId: null }],
            manualMailCodes: new Map(),
            spaceRows: [],
            projectNames: new Map(),
        }));
        expect(mail(await AccessOverviewController.preview(8, 4, ['A'])).sees).toBe(true);
    });
});
