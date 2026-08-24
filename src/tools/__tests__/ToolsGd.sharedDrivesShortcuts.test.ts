import { OAuth2Client } from 'google-auth-library';

/**
 * SKR-1: od migracji drzewa PS ENVI na Dysk współdzielony (sierpień 2026)
 * `findShortcutsByTarget` i `getShortcutMetaData` nie widziały niczego leżącego
 * tam, bo zapytaniom do `googleapis` brakowało flag obsługi Dysków
 * współdzielonych. `src/letters/__tests__/reconcileCaseShortcuts.test.ts`
 * zaślepia CAŁE `ToolsGd`, więc z definicji nie widzi parametrów idących do
 * Google - i była zielona przez cały czas trwania defektu. Ten test zaślepia
 * `googleapis` bezpośrednio, żeby sprawdzić same parametry wywołania.
 */

const filesList = jest.fn();
const filesGet = jest.fn();

jest.mock('googleapis', () => ({
    google: {
        drive: jest.fn(() => ({
            files: {
                list: filesList,
                get: filesGet,
            },
        })),
    },
}));

import ToolsGd from '../ToolsGd';

const auth = {} as OAuth2Client;

describe('ToolsGd - flagi Dysku współdzielonego przy skrótach (SKR-1)', () => {
    beforeEach(() => {
        filesList.mockResolvedValue({ data: { files: [] } });
        filesGet.mockResolvedValue({ data: {} });
    });

    describe('findShortcutsByTarget', () => {
        it('wysyła supportsAllDrives i includeItemsFromAllDrives do drive.files.list', async () => {
            await ToolsGd.findShortcutsByTarget(auth, 'target-1');

            expect(filesList).toHaveBeenCalledTimes(1);
            const params = filesList.mock.calls[0][0];
            expect(params.supportsAllDrives).toBe(true);
            expect(params.includeItemsFromAllDrives).toBe(true);
            expect(params.q).toBe(
                "shortcutDetails.targetId = 'target-1' and trashed = false"
            );
        });
    });

    describe('getShortcutMetaData', () => {
        it('wysyła supportsAllDrives do drive.files.get', async () => {
            await ToolsGd.getShortcutMetaData(auth, 'shortcut-1');

            expect(filesGet).toHaveBeenCalledTimes(1);
            const params = filesGet.mock.calls[0][0];
            expect(params.supportsAllDrives).toBe(true);
            expect(params.fileId).toBe('shortcut-1');
        });
    });
});
