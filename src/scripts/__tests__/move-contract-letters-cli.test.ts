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

test.each([false, true])('--sourceProject: grupa (a) tylko odczytywana, już przepięte wypisane; apply=%s', async (apply) => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const orphan = { id: 90, number: 'P/90', creationDate: '2026-09-30' };
    const alreadyMoved = { ...row, id: 101, number: 'P/101', projectId: 2 };
    query.mockResolvedValueOnce([root]).mockResolvedValueOnce([]).mockResolvedValueOnce([project])
        .mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([orphan])
        .mockResolvedValueOnce([row, alreadyMoved]);
    if (apply) query.mockResolvedValueOnce({ affectedRows: 1 });
    await main(['--contractId=10', '--sourceProject=P1', '--limit=1', ...(apply ? ['--apply'] : [])]);
    expect(query.mock.calls[3]).toEqual(['SELECT Id AS id FROM Projects WHERE OurId = ?', undefined, ['P1']]);
    const [sql, , params] = query.mock.calls[4];
    expect(params).toEqual([1]);
    expect(sql).toContain('l.ProjectId = ? AND l.OfferId IS NULL');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM Letters_Cases lc WHERE lc.LetterId = l.Id)');
    expect(sql).not.toContain('LIMIT');
    const output = log.mock.calls.map(([line]) => line).join('\n');
    expect(output).toContain('Pominięte (a) pisma bez sprawy w projekcie źródłowym: 1\n  Id=90, numer=P/90, data=2026-09-30');
    expect(output).toContain('Już przepięte: 1\n  Id=101, numer=P/101, data=2026-10-01');
    expect(output).toContain('Położenia plików już przepiętych pism skrypt nie sprawdza.');
    expect(output).toContain('pominięte (a)=1');
    expect(output).toContain('pełny przebieg uruchom bez limitu');
    expect(getMetadata).toHaveBeenCalledTimes(1);
    const updates = query.mock.calls.filter(([querySql]) => querySql.startsWith('UPDATE'));
    expect(updates.map(([, , values]) => values)).toEqual(apply ? [[2, 100, 1]] : []);
    expect(move).toHaveBeenCalledTimes(apply ? 1 : 0);
});

test.each([false, true])('nieistniejący --sourceProject przerywa przed zapisami i odczytem Dysku; apply=%s', async (apply) => {
    query.mockResolvedValueOnce([root]).mockResolvedValueOnce([]).mockResolvedValueOnce([project]).mockResolvedValueOnce([]);
    await expect(main(['--contractId=10', '--sourceProject=BRAK', ...(apply ? ['--apply'] : [])])).rejects.toThrow('projektu źródłowego BRAK');
    expect(query.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
    expect(ToolsGapi.getBackgroundAuth).not.toHaveBeenCalled();
    expect(getMetadata).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(ToolsDb.pool.end).toHaveBeenCalled();
});

test('bez --sourceProject raport wskazuje argument i nie przedstawia grupy (a) jako pustej', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    reads();
    await main(['--contractId=10']);
    const output = log.mock.calls.map(([line]) => line).join('\n');
    expect(output).toContain('Listę daje --sourceProject=<OurId>');
    expect(output).toContain('pominięte (a)=nieustalone');
    expect(query).toHaveBeenCalledTimes(4);
});

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
