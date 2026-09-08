/**
 * Przenoszenie pliku/folderu na Dysku Google.
 *
 * Drive nie ma osobnego polecenia "przenieś" - jest jedno "zmień plik", w którym
 * podaje się dodanie nowego rodzica i usunięcie starego. Gdy brakuje tego drugiego,
 * Drive czyta żądanie jako "dopisz drugiego rodzica", a element na Dysku
 * współdzielonym może mieć dokładnie jednego i zwraca:
 * "A shared drive item must have exactly one parent."
 */

jest.mock('googleapis', () => {
    const update = jest.fn().mockResolvedValue({ data: {} });
    return {
        google: { drive: jest.fn(() => ({ files: { update } })) },
    };
});

import { google } from 'googleapis';
import ToolsGd from '../ToolsGd';

const auth = {} as any;
const updateMock = () => (google.drive as unknown as jest.Mock)().files.update;

describe('ToolsGd.moveFileOrFolder', () => {
    it('usuwa stary folder nadrzędny, a nie tylko dopisuje nowy', async () => {
        await ToolsGd.moveFileOrFolder(
            auth,
            { id: 'folder-swz', parents: ['folder-oferty'] },
            'folder-sprawy'
        );

        expect(updateMock()).toHaveBeenCalledWith(
            expect.objectContaining({
                fileId: 'folder-swz',
                addParents: 'folder-sprawy',
                removeParents: 'folder-oferty',
            })
        );
    });

    it('gdy nie podano bieżącego rodzica - zgłasza błąd i nie woła Drive', async () => {
        // Tak właśnie wyglądał obiekt z ToolsGd.setFolder: samo id, bez parents.
        await expect(
            ToolsGd.moveFileOrFolder(
                auth,
                { id: 'folder-swz' },
                'folder-sprawy'
            )
        ).rejects.toThrow(/parents/);

        expect(updateMock()).not.toHaveBeenCalled();
    });
});
