/**
 * Tests ensuring `Milestone` treats MilestoneDates as the canonical source of truth.
 */

jest.mock('../../../BussinesObject');
jest.mock('../../../tools/ToolsGd');
jest.mock('../../../tools/ToolsSheets');
jest.mock('../../../ScrumSheet/CurrentSprint');
jest.mock('../../../setup/Setup');

import Milestone from '../Milestone';
import { MilestoneData, MilestoneDateData } from '../../../types/types';

const baseType = {
    id: 1,
    name: 'Złożenie oferty',
    isUniquePerContract: true,
    _isDefault: true,
    _folderNumber: '01',
};

const baseOffer = {
    id: 42,
    alias: 'TEST-OFFER',
    isOur: true,
    form: 'przetarg',
    bidProcedure: 'nieograniczony',
    employerName: 'Zamawiający',
    _city: { id: 1, name: 'Warszawa', code: 'WAW' },
    _type: { id: 1, name: 'Oferta', isOur: true },
};

describe('Milestone – MilestoneDates as source of truth', () => {
    function buildMilestone(dates: Partial<MilestoneDateData>[]) {
        const normalizedDates = dates.map((date) => ({
            startDate: date.startDate ?? '',
            endDate: date.endDate ?? '',
            milestoneId: 0,
            description: date.description,
            lastUpdated: date.lastUpdated,
        } as MilestoneDateData));

        return new Milestone({
            name: 'Złożenie',
            description: '',
            _type: baseType,
            _offer: baseOffer as any,
            _dates: normalizedDates,
        } as MilestoneData);
    }

    it('stores _dates exactly as provided', () => {
        const milestone = buildMilestone([
            { startDate: '2024-01-15', endDate: '2024-03-31' },
        ]);

        expect(milestone._dates[0].startDate).toBe('2024-01-15');
        expect(milestone._dates[0].endDate).toBe('2024-03-31');
    });

    it('keeps _dates empty when none are provided', () => {
        const milestone = buildMilestone([]);

        expect(milestone._dates).toHaveLength(0);
    });

    it('accepts updates to _dates and keeps them accessible', () => {
        const milestone = buildMilestone([
            { startDate: '2024-01-01', endDate: '2024-03-01' },
        ]);

        milestone._dates = [
            { startDate: '2025-05-01', endDate: '2025-08-31' } as any,
        ];

        expect(milestone._dates[0].startDate).toBe('2025-05-01');
        expect(milestone._dates[0].endDate).toBe('2025-08-31');
    });
});
