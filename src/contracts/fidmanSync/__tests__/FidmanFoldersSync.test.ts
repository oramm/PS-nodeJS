import fs from 'fs';
import path from 'path';

jest.mock('../../../tools/ToolsDb');
import Setup from '../../../setup/Setup';
import {
    buildContractFoldersPayload, enqueueFidmanFoldersPush, fidmanSkipReasonLabel,
} from '../FidmanSync';

const folder = 'folder_contract_42';
const caseRow = { Id: 7, TypeId: 75, MilestoneId: 10, GdFolderId: 'folder_case_7' };

describe('LMF-2 foldery kontraktu', () => {
    beforeEach(() => {
        jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({
            ...Setup.FidmanSync, contractTypeIds: [3, 4],
        });
    });

    function connection(options: {
        contract?: any; milestones?: any[]; cases?: any[]; outbox?: any[];
    } = {}) {
        const contract = options.contract === undefined
            ? { TypeId: 3, FidmanSyncEnabled: 1, GdFolderId: folder } : options.contract;
        const milestones = options.milestones ?? [{ Id: 10, ContractId: 42, TypeId: 50 }];
        const cases = options.cases ?? [];
        const outbox = options.outbox ?? [];
        const conn = {
            query: jest.fn(async (sql: string, params: any[]) => {
                expect(params).toEqual([42]);
                if (sql.includes('FROM Contracts')) return [contract ? [contract] : []];
                if (sql.includes('FROM Cases')) {
                    expect(sql).toContain('m.Id = c.MilestoneId');
                    expect(sql).toContain('m.ContractId = ? AND m.TypeId = 50');
                    expect(sql).toContain('ORDER BY c.Id');
                    expect(sql).not.toMatch(/Parent|Status/);
                    return [cases.filter((c) => milestones.some((m) =>
                        m.Id === c.MilestoneId && m.ContractId === 42 && m.TypeId === 50
                    )).sort((a, b) => a.Id - b.Id)];
                }
                expect(sql).toContain("Kind = 'contract.folders' AND RefId = ?");
                expect(sql).toContain('ORDER BY Id DESC LIMIT 1 FOR UPDATE');
                return [outbox.filter((r) => r.Kind === 'contract.folders' && r.RefId === 42)
                    .sort((a, b) => b.Id - a.Id).slice(0, 1)];
            }),
            execute: jest.fn(async (sql: string, params: any[]) => {
                if (sql.startsWith('INSERT')) {
                    const Id = Math.max(0, ...outbox.map((r) => r.Id)) + 1;
                    outbox.push({ Id, Kind: params[0], RefId: params[1], Payload: params[2], Status: 'PENDING' });
                    return [{ insertId: Id }];
                }
                expect(sql).toContain("Kind = 'contract.folders' AND RefId = ? AND Id < ?");
                expect(sql).toContain("Status IN ('PENDING', 'FAILED')");
                for (const row of outbox) {
                    if (row.Kind === 'contract.folders' && row.RefId === params[0] &&
                        row.Id < params[1] && ['PENDING', 'FAILED'].includes(row.Status)) {
                        row.Status = 'SKIPPED'; row.SkipReason = 'SUPERSEDED'; row.LastError = null;
                    }
                }
                return [{ affectedRows: 1 }];
            }),
        };
        return { conn: conn as any, outbox, cases };
    }

    function queued(Id: number, Status: string, payload: any, extra: any = {}) {
        return { Id, Status, Kind: 'contract.folders', RefId: 42, Payload: JSON.stringify(payload), ...extra };
    }

    it('umowa bez kamienia 50', async () => {
        const { conn } = connection({ milestones: [{ Id: 10, ContractId: 42, TypeId: 51 }], cases: [caseRow] });
        expect(await buildContractFoldersPayload(42, conn)).toEqual({
            kind: 'contract.folders', payload: { legacyContractId: 42, contractFolderId: folder, cases: [] },
        });
    });

    it('umowa z jednym kamieniem 50', async () => {
        const { conn } = connection({ cases: [caseRow] });
        const { payload } = await buildContractFoldersPayload(42, conn);
        expect(payload.cases).toEqual([{ psCaseId: 7, psCaseTypeId: 75, folderId: 'folder_case_7' }]);
        // Próbka zweryfikowana przeciw contractFoldersPayloadSchema w validation.ts FIDmana:
        // jawne pola, ścisłe klucze, int, regex folderów, unikalne psCaseId; bez folderu kamienia.
        expect(Object.keys(payload).sort()).toEqual(['cases', 'contractFolderId', 'legacyContractId']);
        expect(Number.isInteger(payload.legacyContractId)).toBe(true);
        expect(payload.contractFolderId).toMatch(/^[A-Za-z0-9_-]{10,128}$/);
        for (const entry of payload.cases) {
            expect(Object.keys(entry).sort()).toEqual(['folderId', 'psCaseId', 'psCaseTypeId']);
            expect(Number.isInteger(entry.psCaseId) && Number.isInteger(entry.psCaseTypeId)).toBe(true);
            expect(entry.folderId).toMatch(/^[A-Za-z0-9_-]{10,128}$/);
        }
        expect(new Set(payload.cases.map((c) => c.psCaseId)).size).toBe(payload.cases.length);
    });

    it('wiele kamieni i spraw tego samego rodzaju', async () => {
        const { conn } = connection({
            milestones: [
                { Id: 10, ContractId: 42, TypeId: 50 }, { Id: 11, ContractId: 42, TypeId: 50 },
                { Id: 12, ContractId: 42, TypeId: 51 }, { Id: 13, ContractId: 99, TypeId: 50 },
            ],
            cases: [
                { ...caseRow, Id: 9, MilestoneId: 11 }, caseRow,
                { ...caseRow, Id: 8 }, { ...caseRow, Id: 12, MilestoneId: 12 },
                { ...caseRow, Id: 13, MilestoneId: 13 },
            ],
        });
        expect((await buildContractFoldersPayload(42, conn)).payload.cases.map((c) => c.psCaseId)).toEqual([7, 8, 9]);
    });

    it('sprawa skasowana znika z listy', async () => {
        const { conn, cases } = connection({ cases: [caseRow] });
        expect((await buildContractFoldersPayload(42, conn)).payload.cases).toHaveLength(1);
        cases.splice(0);
        expect((await buildContractFoldersPayload(42, conn)).payload.cases).toEqual([]);
    });

    it('podsprawa obecna', async () => {
        const { conn } = connection({ cases: [{ ...caseRow, TypeId: 111, ParentId: 6 }] });
        expect((await buildContractFoldersPayload(42, conn)).payload.cases[0].psCaseTypeId).toBe(111);
    });

    it('sprawa bez folderu pominięta', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { conn } = connection({ cases: [{ ...caseRow, GdFolderId: null }, { ...caseRow, Id: 8, GdFolderId: '' }] });
        expect((await buildContractFoldersPayload(42, conn)).payload.cases).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('umowa 42, sprawa 7'));
    });

    it('folder umowy pusty daje null', async () => {
        const { conn } = connection({ contract: { GdFolderId: '' } });
        expect((await buildContractFoldersPayload(42, conn)).payload).toEqual({
            legacyContractId: 42, contractFolderId: null, cases: [],
        });
    });

    it('identyczna migawka nie tworzy wpisu', async () => {
        for (const Status of ['PENDING', 'SENT']) {
            const payload = { cases: [], contractFolderId: folder, legacyContractId: 42 };
            const { conn } = connection({ outbox: [queued(1, Status, payload)] });
            expect(await enqueueFidmanFoldersPush(42, conn)).toBeNull();
            expect(conn.execute).not.toHaveBeenCalled();
            expect(conn.query.mock.calls[0][0]).toContain('FOR UPDATE');
        }
    });

    it('nowa migawka zastępuje starszy FAILED przez SUPERSEDED', async () => {
        const { conn, outbox } = connection({ outbox: [
            queued(1, 'FAILED', {}, { LastError: 'timeout' }), queued(2, 'PENDING', {}),
            queued(3, 'SENT', {}), queued(4, 'SKIPPED', {}),
            queued(5, 'FAILED', {}, { RefId: 99 }), queued(6, 'FAILED', {}, { Kind: 'contract.personnel' }),
        ] });
        expect(await enqueueFidmanFoldersPush(42, conn)).toBe(7);
        expect(outbox.slice(0, 2).map((r) => [r.Status, r.SkipReason, r.LastError]))
            .toEqual([['SKIPPED', 'SUPERSEDED', null], ['SKIPPED', 'SUPERSEDED', null]]);
        expect(outbox.slice(2).map((r) => r.Status)).toEqual(['SENT', 'SKIPPED', 'FAILED', 'FAILED', 'PENDING']);
        expect(fidmanSkipReasonLabel('SUPERSEDED')).toBe('Wpis zastąpiony nowszą migawką folderów kontraktu.');
        expect(conn.execute.mock.calls[0][0]).toContain('INSERT');
        expect(conn.execute.mock.calls[1][0]).toContain('UPDATE');
        expect(JSON.parse(outbox[6].Payload)).toEqual({ legacyContractId: 42, contractFolderId: folder, cases: [] });
    });

    it('umowa poza zakresem nie tworzy wpisu', async () => {
        for (const contract of [
            { TypeId: 3, FidmanSyncEnabled: 0 }, { TypeId: 99, FidmanSyncEnabled: 1 }, null,
        ]) {
            const { conn } = connection({ contract });
            expect(await enqueueFidmanFoldersPush(42, conn)).toBeNull();
            expect(conn.query).toHaveBeenCalledTimes(1);
            expect(conn.execute).not.toHaveBeenCalled();
        }
    });

    it('sprawa zamknięta obecna', async () => {
        const { conn } = connection({ cases: [{ ...caseRow, Status: 'Zamknięta' }] });
        expect((await buildContractFoldersPayload(42, conn)).payload.cases).toHaveLength(1);
    });

    it('niepoprawny identyfikator folderu pominięty z ostrzeżeniem', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { conn } = connection({ cases: ['short', 'a'.repeat(129), 'folder with spaces', 'https://drive.google.com/123']
            .map((GdFolderId, i) => ({ ...caseRow, Id: i + 1, GdFolderId })) });
        expect((await buildContractFoldersPayload(42, conn)).payload.cases).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(4);
    });

    it('force pomija porównanie identycznej migawki', async () => {
        const payload = { legacyContractId: 42, contractFolderId: folder, cases: [] };
        const { conn, outbox } = connection({ outbox: [queued(1, 'PENDING', payload)] });
        expect(await enqueueFidmanFoldersPush(42, conn, true)).toBe(2);
        expect(conn.query.mock.calls.some(([sql]: [string]) => sql.includes('FROM FidmanSyncOutbox'))).toBe(false);
        expect(outbox[0].SkipReason).toBe('SUPERSEDED');
    });

    it('nowszy FAILED nie jest pomijany przez identyczny starszy SENT', async () => {
        const payload = { legacyContractId: 42, contractFolderId: folder, cases: [] };
        const { conn, outbox } = connection({ outbox: [queued(1, 'SENT', payload), queued(2, 'FAILED', { ...payload, cases: [caseRow] })] });
        expect(await enqueueFidmanFoldersPush(42, conn)).toBe(3);
        expect(outbox[1].SkipReason).toBe('SUPERSEDED');
    });

    it('identyczny JSON jako obiekt jest pomijany', async () => {
        const { conn } = connection({ cases: [caseRow], outbox: [queued(1, 'SENT', {}, {
            Payload: { cases: [{ folderId: 'folder_case_7', psCaseTypeId: 75, psCaseId: 7 }], contractFolderId: folder, legacyContractId: 42 },
        })] });
        expect(await enqueueFidmanFoldersPush(42, conn)).toBeNull();
    });

    it('błąd oznaczania starszych wpisów trafia do transakcji wywołującego', async () => {
        const { conn } = connection();
        conn.execute.mockResolvedValueOnce([{ insertId: 1 }]).mockRejectedValueOnce(new Error('update failed'));
        await expect(enqueueFidmanFoldersPush(42, conn)).rejects.toThrow('update failed');
    });
});

it('LMF-1 migracja 015 zachowuje ENUM i komentarz, down odtwarza 014', () => {
    const dir = path.resolve(__dirname, '../../migrations');
    const old = fs.readFileSync(path.join(dir, '014_add_contract_personnel_kind_to_fidman_sync_outbox.sql'), 'utf8');
    const up = fs.readFileSync(path.join(dir, '015_add_contract_folders_kind_to_fidman_sync_outbox.sql'), 'utf8');
    const down = fs.readFileSync(path.join(dir, '015_add_contract_folders_kind_to_fidman_sync_outbox_down.sql'), 'utf8');
    const values = (sql: string) => [...sql.match(/ENUM\(([\s\S]*?)\)/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values(up)).toEqual([...values(old), 'contract.folders']);
    expect(values(down)).toEqual(values(old));
    for (const sql of [up, down]) {
        expect(sql).toMatch(/\) NOT NULL/);
        expect(sql).not.toMatch(/DEFAULT/);
        expect(sql.match(/COMMENT '[^']*'/)?.[0]).toBe(old.match(/COMMENT '[^']*'/)?.[0]);
    }
});
