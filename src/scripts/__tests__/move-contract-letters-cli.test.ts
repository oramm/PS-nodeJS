jest.mock('../../setup/loadEnv', () => ({ loadEnv: jest.fn() }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: {
    getQueryCallbackAsync: jest.fn(), pool: { end: jest.fn().mockResolvedValue(undefined) },
} }));
jest.mock('../../setup/Sessions/ToolsGapi', () => ({ __esModule: true, default: {
    getBackgroundAuth: jest.fn().mockResolvedValue({}),
} }));
jest.mock('googleapis', () => ({ google: { drive: jest.fn(() => ({ files: { get: jest.fn(), update: jest.fn() } })) } }));

import ToolsDb from '../../tools/ToolsDb';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import { google } from 'googleapis';
const getMetadata = jest.fn();
const move = jest.fn();
import { main } from '../move-contract-letters';

const query = ToolsDb.getQueryCallbackAsync as jest.Mock;
const root = { id: 10, number: 'U/10', name: 'Inżynier', ourId: 'U10', projectOurId: 'P2' };
const project = { id: 2, ourId: 'P2', name: 'Docelowy', lettersGdFolderId: 'target' };
const row = { id: 100, number: 'P/100', creationDate: '2026-10-01', projectId: 1, offerId: null,
    sourceLettersFolderId: 'source', gdFolderId: 'folder', gdDocumentId: 'file', caseId: 1, contractId: 10, caseOfferId: null };

beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    getMetadata.mockReset().mockResolvedValue({ data: { id: 'folder', parents: ['source'], trashed: false } });
    move.mockReset().mockResolvedValue({});
    (google.drive as jest.Mock).mockReturnValue({ files: { get: getMetadata, update: move } });
    process.exitCode = 0;
});

function reads(folderId: string | null = 'target') {
    query.mockResolvedValueOnce([root]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...project, lettersGdFolderId: folderId }]).mockResolvedValueOnce([row]);
}

test('runner podglądu: SELECT i odczyt Dysku, zero zapisów', async () => {
    reads();
    await main(['--contractId=10']);
    expect(query.mock.calls).toHaveLength(4);
    expect(query.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
    expect(ToolsGapi.getBackgroundAuth).toHaveBeenCalledTimes(1);
    expect(getMetadata).toHaveBeenCalledWith({ fileId: 'folder', fields: 'id, name, parents, trashed', supportsAllDrives: true });
    expect(move).not.toHaveBeenCalled();
});

test('runner apply: usuwa tylko źródłowego rodzica, potem UPDATE sprawdza poprzedni ProjectId', async () => {
    reads();
    getMetadata.mockResolvedValue({ data: { id: 'folder', parents: ['source', 'other'] } });
    query.mockResolvedValueOnce({ affectedRows: 1 });
    await main(['--contractId=10', '--apply']);
    expect(move).toHaveBeenCalledWith({ fileId: 'folder', removeParents: 'source', addParents: 'target', supportsAllDrives: true });
    expect(query.mock.calls[4]).toEqual(['UPDATE Letters SET ProjectId = ? WHERE Id = ? AND ProjectId = ?', undefined, [2, 100, 1]]);
    expect(move.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[4]);
});

test('brak folderu Korespondencji: PYTANIE i przerwanie przed jakimkolwiek zapisem', async () => {
    reads(null);
    await expect(main(['--contractId=10', '--apply'])).rejects.toThrow('PYTANIE');
    expect(query).toHaveBeenCalledTimes(4);
    expect(ToolsGapi.getBackgroundAuth).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
});

test('rozjazd projektów: przerwanie przed wyborem pism i zapisami', async () => {
    query.mockResolvedValueOnce([root]).mockResolvedValueOnce([{ ...root, id: 11, projectOurId: 'P1' }]);
    await expect(main(['--contractId=10', '--apply'])).rejects.toThrow('inny projekt');
    expect(query).toHaveBeenCalledTimes(2);
    expect(ToolsGapi.getBackgroundAuth).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
});


test('runner --no-drive-check: pomija autoryzację i odczyt Dysku, mówi o tym w raporcie', async () => {
    reads(null);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await main(['--contractId=10', '--no-drive-check']);
        expect(getMetadata).not.toHaveBeenCalled();
        expect(ToolsGapi.getBackgroundAuth).not.toHaveBeenCalled();
        expect(query).toHaveBeenCalledTimes(4);
        expect(log.mock.calls.flat().join('\n')).toContain('pominięto odczyt Dysku');
        expect(log.mock.calls.at(-1)?.[0]).toContain('bez sprawdzenia Dysku=1');
    } finally { log.mockRestore(); }
});

test('--apply z --no-drive-check odrzucone przed odczytami', async () => {
    await expect(main(['--contractId=10', '--apply', '--no-drive-check'])).rejects.toThrow('wyłącznie w podglądzie');
    expect(query).not.toHaveBeenCalled();
    expect(getMetadata).not.toHaveBeenCalled();
});

test('runner raportuje 0 zmienionych wierszy jako błąd i ustawia kod wyjścia', async () => {
    reads();
    query.mockResolvedValueOnce({ affectedRows: 0 });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await main(['--contractId=10', '--apply']);
        expect(process.exitCode).toBe(1);
        expect(log.mock.calls.flat().join('\n')).toContain('ProjectId zmienił się');
        expect(log.mock.calls.at(-1)?.[0]).toContain('przeniesione (Dysk+baza)=0 / tylko baza=0');
        expect(log.mock.calls.at(-1)?.[0]).toContain('błędy=1');
    } finally { log.mockRestore(); process.exitCode = 0; }
});

test('runner ELSEWHERE: raportuje Id, numer, datę i rodzica, bez zapisów', async () => {
    reads();
    getMetadata.mockResolvedValue({ data: { parents: ['case-folder'] } });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await main(['--contractId=10', '--apply']);
        expect(query).toHaveBeenCalledTimes(4);
        expect(move).not.toHaveBeenCalled();
        expect(log.mock.calls.flat().join('\n')).toContain('Id=100, numer=P/100, data=2026-10-01: Rodzice: case-folder');
        expect(log.mock.calls.at(-1)?.[0]).toContain('(d)=1 / błędy=0');
    } finally { log.mockRestore(); }
});
