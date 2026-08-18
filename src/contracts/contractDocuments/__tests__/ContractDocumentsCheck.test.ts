/**
 * Kontrola „czy wgrano umowę na Dysk" — reguły domenowe i odporność.
 *
 * Test jednostkowy: baza i Dysk zmockowane. Pokrywa to, co da się sprawdzić bez nich, czyli
 * decyzje właściciela zakodowane w module:
 *   - umowa z kilkoma folderami: wystarczy trafienie w którymkolwiek,
 *   - plik w podfolderze zalicza umowę, pusty podfolder NIE,
 *   - format pliku nie ma znaczenia, a skrót liczy się jako plik (warunek `mimeType != folder`,
 *     a nie lista dozwolonych typów),
 *   - kosz nie liczy się jako wgrana umowa (`trashed = false`),
 *   - Dysk współdzielony (flagi allDrives — bez nich zapytanie zwraca pustkę),
 *   - i najważniejsze: BŁĄD DYSKU NIE NADPISUJE POPRZEDNIEGO WYNIKU.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockFilesList = jest.fn<any>();

jest.mock('../../../tools/ToolsDb');
jest.mock('../../../setup/Sessions/ToolsGapi');
jest.mock('googleapis', () => ({
    google: { drive: () => ({ files: { list: mockFilesList } }) },
}));

import ToolsDb from '../../../tools/ToolsDb';
import ToolsGapi from '../../../setup/Sessions/ToolsGapi';
import { runContractDocumentsCheck } from '../ContractDocumentsCheck';

const ORIG_TYPE_IDS = process.env.CONTRACT_DOCUMENT_CASE_TYPE_IDS;

/** Wiersz „umowa -> folder" tak, jak oddaje go selectBatch(). */
function folderRow(contractId: number, gdFolderId: string, ourIdOrNumber = 'WAW.IK.03') {
    return {
        ContractId: contractId,
        OurIdOrNumber: ourIdOrNumber,
        ProjectOurId: '2023.WAW.01',
        GdFolderId: gdFolderId,
    };
}

/** Podstawia odpowiedzi bazy: pierwsze zapytanie to partia, każde z COUNT(*) to `remaining`. */
function mockDb(batch: any[], remaining = 0) {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(
        async (sql: any) =>
            String(sql).includes('COUNT(*)') ? [{ Ile: remaining }] : batch
    );
}

/** Odpowiedzi Dysku: które foldery mają pliki i jakie mają podfoldery. */
function mockDrive(options: {
    filesIn?: Record<string, boolean>;
    subfoldersOf?: Record<string, string[]>;
}) {
    const { filesIn = {}, subfoldersOf = {} } = options;
    mockFilesList.mockImplementation(async ({ q }: any) => {
        const asksForFiles = String(q).includes('mimeType !=');
        const parents = [...String(q).matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
        if (asksForFiles)
            return {
                data: {
                    files: parents
                        .filter((parent) => filesIn[parent])
                        .map((parent) => ({ parents: [parent] })),
                },
            };
        return {
            data: {
                files: parents.flatMap((parent) =>
                    (subfoldersOf[parent] ?? []).map((id) => ({ id, parents: [parent] }))
                ),
            },
        };
    });
}

/** Id umów zapisanych jako „umowa jest" / „brak umowy". */
function savedIds() {
    const calls = (ToolsDb.executeSQL as jest.Mock).mock.calls as any[][];
    const find = (flag: string) =>
        calls.find(([sql]) => String(sql).includes(`ContractDocumentPresent = ${flag}`));
    return {
        present: (find('1')?.[1] as any[])?.[0] ?? [],
        missing: (find('0')?.[1] as any[])?.[0] ?? [],
        updateCount: calls.length,
    };
}

describe('runContractDocumentsCheck', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CONTRACT_DOCUMENT_CASE_TYPE_IDS = '85,75';
        (ToolsGapi.getBackgroundAuth as jest.Mock).mockResolvedValue({} as never);
        (ToolsDb.executeSQL as jest.Mock).mockResolvedValue({} as never);
    });

    afterEach(() => {
        if (ORIG_TYPE_IDS === undefined) delete process.env.CONTRACT_DOCUMENT_CASE_TYPE_IDS;
        else process.env.CONTRACT_DOCUMENT_CASE_TYPE_IDS = ORIG_TYPE_IDS;
    });

    describe('reguła „coś w środku"', () => {
        it('plik bezpośrednio w folderze zalicza umowę', async () => {
            mockDb([folderRow(1, 'folderA')]);
            mockDrive({ filesIn: { folderA: true } });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.present).toBe(1);
            expect(summary.missing).toBe(0);
            expect(savedIds().present).toEqual([1]);
        });

        it('pusty folder to brak umowy, z odnośnikiem do miejsca, gdzie ma trafić', async () => {
            mockDb([folderRow(1, 'folderA', '12/ZP/2024')]);
            mockDrive({ filesIn: {} });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.missing).toBe(1);
            expect(savedIds().missing).toEqual([1]);
            expect(summary.missingContracts).toEqual([
                {
                    id: 1,
                    ourIdOrNumber: '12/ZP/2024',
                    projectOurId: '2023.WAW.01',
                    folderUrl: 'https://drive.google.com/drive/folders/folderA',
                },
            ]);
        });

        it('plik w podfolderze zalicza umowę', async () => {
            mockDb([folderRow(1, 'folderA')]);
            mockDrive({
                filesIn: { podfolder1: true },
                subfoldersOf: { folderA: ['podfolder1'] },
            });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.present).toBe(1);
            expect(savedIds().present).toEqual([1]);
        });

        it('sam pusty podfolder to nadal brak umowy', async () => {
            mockDb([folderRow(1, 'folderA')]);
            mockDrive({ filesIn: {}, subfoldersOf: { folderA: ['pustyPodfolder'] } });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.missing).toBe(1);
            expect(savedIds().missing).toEqual([1]);
        });

        it('nie schodzi głębiej niż jeden poziom podfolderów', async () => {
            mockDb([folderRow(1, 'folderA')]);
            mockDrive({
                filesIn: { wnuk: true },
                subfoldersOf: { folderA: ['podfolder1'], podfolder1: ['wnuk'] },
            });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.missing).toBe(1);
        });
    });

    describe('umowa z kilkoma folderami', () => {
        it('wystarczy trafienie w którymkolwiek', async () => {
            mockDb([folderRow(1, 'pusty'), folderRow(1, 'zPlikiem')]);
            mockDrive({ filesIn: { zPlikiem: true } });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.checked).toBe(1);
            expect(summary.present).toBe(1);
            expect(savedIds().present).toEqual([1]);
        });

        it('brak we wszystkich to brak umowy', async () => {
            mockDb([folderRow(1, 'pustyA'), folderRow(1, 'pustyB')]);
            mockDrive({ filesIn: {} });

            const summary = await runContractDocumentsCheck(10);

            expect(summary.checked).toBe(1);
            expect(savedIds().missing).toEqual([1]);
        });
    });

    describe('kształt zapytania do Dysku', () => {
        it('pyta o cokolwiek, co nie jest folderem — bez listy dozwolonych formatów', async () => {
            mockDb([folderRow(1, 'folderA')]);
            mockDrive({ filesIn: { folderA: true } });

            await runContractDocumentsCheck(10);

            const q = String(mockFilesList.mock.calls[0][0].q);
            expect(q).toContain("mimeType != 'application/vnd.google-apps.folder'");
            // Skrót ma własny typ MIME i nie jest folderem, więc wpada pod ten sam warunek.
            expect(q).not.toContain('application/pdf');
            expect(q).not.toContain('shortcut');
        });

        it('pomija kosz i obsługuje Dysk współdzielony', async () => {
            mockDb([folderRow(1, 'folderA')]);
            mockDrive({ filesIn: { folderA: true } });

            await runContractDocumentsCheck(10);

            const params = mockFilesList.mock.calls[0][0];
            expect(String(params.q)).toContain('trashed = false');
            expect(params.supportsAllDrives).toBe(true);
            expect(params.includeItemsFromAllDrives).toBe(true);
        });
    });

    describe('odporność', () => {
        it('błąd Dysku przerywa przebieg i NIE zapisuje niczego', async () => {
            mockDb([folderRow(1, 'folderA'), folderRow(2, 'folderB')], 7);
            mockFilesList.mockRejectedValue(new Error('invalid_grant') as never);

            const summary = await runContractDocumentsCheck(10);

            expect(summary.aborted).toBe(true);
            expect(summary.abortReason).toContain('invalid_grant');
            expect(summary.checked).toBe(0);
            expect(summary.remaining).toBe(7);
            // To jest ta asercja, o którą chodzi: awaria dostępu nie może zamienić się
            // w setki fałszywych „brak umowy".
            expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
        });

        it('wygasła autoryzacja przerywa przebieg przed pierwszym zapytaniem', async () => {
            mockDb([folderRow(1, 'folderA')], 3);
            (ToolsGapi.getBackgroundAuth as jest.Mock).mockRejectedValue(
                new Error('Brak REFRESH_TOKEN w .env') as never
            );

            const summary = await runContractDocumentsCheck(10);

            expect(summary.aborted).toBe(true);
            expect(mockFilesList).not.toHaveBeenCalled();
            expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
        });

        it('pusta lista typów spraw nie rusza ani bazy, ani Dysku', async () => {
            process.env.CONTRACT_DOCUMENT_CASE_TYPE_IDS = '';
            mockDb([folderRow(1, 'folderA')]);

            const summary = await runContractDocumentsCheck(10);

            expect(summary.aborted).toBe(true);
            expect(summary.abortReason).toContain('CONTRACT_DOCUMENT_CASE_TYPE_IDS');
            expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
        });

        it('pusta partia kończy się bez zapisu i oddaje stan kolejki', async () => {
            mockDb([], 0);

            const summary = await runContractDocumentsCheck(10);

            expect(summary.checked).toBe(0);
            expect(summary.aborted).toBe(false);
            expect(summary.remaining).toBe(0);
            expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
        });
    });
});
