import { OAuth2Client } from 'google-auth-library';

/**
 * SKR-5: `getFileMetaDataByNameAndMimeType` stoi w schemacie „znajdź istniejący
 * plik, a jak nie ma, załóż nowy" (spis spraw, rejestr dokumentacji
 * zatwierdzonej, folder wizyt na budowie). Bez flag obsługi Dysków
 * współdzielonych zapytanie nie widziało plików leżących na Dysku
 * współdzielonym, więc gałąź „załóż nowy" wchodziła na plik, który już istniał.
 *
 * Zmierzone 2026-08-24 na żywym Dysku: to samo zapytanie bez flag zwracało 0
 * dla istniejących folderów i arkuszy na Dysku współdzielonym
 * `0AFGVqb32NbAaUk9PVA`, a z flagami 1.
 *
 * Test zaślepia `googleapis`, nie `ToolsGd` - inaczej z definicji nie widziałby
 * parametrów idących do Google.
 */

const filesList = jest.fn();

jest.mock('googleapis', () => ({
    google: {
        drive: jest.fn(() => ({
            files: {
                list: filesList,
            },
        })),
    },
}));

import ToolsGd from '../ToolsGd';

const auth = {} as OAuth2Client;

describe('ToolsGd - flagi Dysku współdzielonego przy szukaniu po nazwie i typie (SKR-5)', () => {
    beforeEach(() => {
        filesList.mockReset();
        filesList.mockResolvedValue({ data: { files: [] } });
    });

    it('wysyła supportsAllDrives i includeItemsFromAllDrives do drive.files.list', async () => {
        await ToolsGd.getFileMetaDataByNameAndMimeType(auth, {
            parentId: 'parent-1',
            fileName: 'Spis spraw - aktywne',
            mimeType: 'application/vnd.google-apps.spreadsheet',
        });

        expect(filesList).toHaveBeenCalledTimes(1);
        const params = filesList.mock.calls[0][0];
        expect(params.supportsAllDrives).toBe(true);
        expect(params.includeItemsFromAllDrives).toBe(true);
        expect(params.q).toBe(
            "name = 'Spis spraw - aktywne' and 'parent-1' in parents and " +
                "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
        );
    });

    it('zwraca pierwszy znaleziony plik - gałąź „znaleziono istniejący"', async () => {
        filesList.mockResolvedValue({
            data: { files: [{ id: 'sheet-1', name: 'Spis spraw - aktywne' }] },
        });

        const found = await ToolsGd.getFileMetaDataByNameAndMimeType(auth, {
            parentId: 'parent-1',
            fileName: 'Spis spraw - aktywne',
            mimeType: 'application/vnd.google-apps.spreadsheet',
        });

        expect(found?.id).toBe('sheet-1');
    });
});
