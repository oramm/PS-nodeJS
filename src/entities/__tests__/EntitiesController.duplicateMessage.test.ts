import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');

import ToolsDb from '../../tools/ToolsDb';
import EntitiesController from '../EntitiesController';

describe('EntitiesController — komunikaty dla duplikatów podmiotu', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
    });

    it('pokazuje NIP, gdy zapis narusza unikalność TaxNumber', async () => {
        (ToolsDb.addInDb as any).mockRejectedValue({
            code: 'ER_DUP_ENTRY',
            sqlMessage: "Duplicate entry '1234563218' for key 'TaxNumber'",
        });

        await expect(
            EntitiesController.add({
                name: 'Nowy podmiot',
                shortName: 'NOWY',
                taxNumber: '123-456-32-18',
            })
        ).rejects.toThrow('Numer NIP "1234563218" jest już przypisany do innego podmiotu');
    });

    it('dalej pokazuje skróconą nazwę, gdy zapis narusza unikalność ShortName', async () => {
        (ToolsDb.addInDb as any).mockRejectedValue({
            code: 'ER_DUP_ENTRY',
            sqlMessage: "Duplicate entry 'NOWY' for key 'uq_entities_short_name'",
        });

        await expect(
            EntitiesController.add({ name: 'Nowy podmiot', shortName: 'NOWY' })
        ).rejects.toThrow('Skrócona nazwa "NOWY" jest już zajęta');
    });
});
