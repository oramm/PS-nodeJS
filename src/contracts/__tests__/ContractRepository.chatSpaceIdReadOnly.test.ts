/**
 * CHT-3: Contracts.ChatSpaceId jest w modelu tylko do odczytu. Zwykly zapis umowy
 * (add / edit, takze z `fieldsToUpdate`) nigdy nie pisze tej kolumny; pole zostaje w obiekcie.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');

import ToolsDb from '../../tools/ToolsDb';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import ContractRepository from '../ContractRepository';

const base = {
    id: 4242,
    _type: { id: 4, name: 'Czerwony', isOur: false },
    typeId: 4,
    number: '001',
    name: 'Testowy kontrakt',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'W trakcie',
    _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-1' },
    projectOurId: 'PRJ-001',
    chatSpaceId: 9,
};

describe('ContractRepository: chatSpaceId tylko do odczytu', () => {
    let written: Array<{ table: string; data: any; fields?: string[] }>;

    beforeEach(() => {
        jest.clearAllMocks();
        written = [];
        (ToolsDb.addInDb as any).mockImplementation(
            async (table: string, data: any) => {
                written.push({ table, data: { ...data } });
                data.id = 4242;
                return data;
            }
        );
        (ToolsDb.editInDb as any).mockImplementation(
            async (table: string, data: any, _c: any, _t: any, fields: any) => {
                written.push({ table, data: { ...data }, fields });
            }
        );
    });

    const contracts = () =>
        written.filter((w) => w.table === 'Contracts');

    it('add: DTO z chatSpaceId nie trafia do zapisu, a obiekt zachowuje wartosc', async () => {
        const c = new ContractOur({ ...base, ourId: 'WAW.UR.001', adminId: 1, managerId: 2 });
        expect(c.chatSpaceId).toBe(9);
        await new ContractRepository().addInDb(c);
        expect(contracts()[0].data).not.toHaveProperty('chatSpaceId');
        expect(c.chatSpaceId).toBe(9);
    });

    it('edit bez fieldsToUpdate (ContractOur): kolumna nie jest pisana', async () => {
        const c = new ContractOur({ ...base, ourId: 'WAW.UR.001', adminId: 1, managerId: 2 });
        await new ContractRepository().editInDb(c);
        expect(contracts()[0].data).not.toHaveProperty('chatSpaceId');
        expect(c.chatSpaceId).toBe(9);
    });

    it('edit bez fieldsToUpdate (ContractOther): kolumna nie jest pisana', async () => {
        const c = new ContractOther({ ...base });
        await new ContractRepository().editInDb(c);
        expect(contracts()[0].data).not.toHaveProperty('chatSpaceId');
    });

    it('edit z fieldsToUpdate zawierajacym chatSpaceId: pole wycinane z listy', async () => {
        const c = new ContractOther({ ...base });
        await new ContractRepository().editInDb(c, undefined, false, [
            'name',
            'chatSpaceId',
        ]);
        expect(contracts()[0].fields).toEqual(['name']);
    });

    it('edit tylko z chatSpaceId: brak zapisu', async () => {
        const c = new ContractOther({ ...base });
        await new ContractRepository().editInDb(c, undefined, false, [
            'chatSpaceId',
        ]);
        expect(written).toHaveLength(0);
    });
});
