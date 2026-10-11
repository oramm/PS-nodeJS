import { ContractScopeRow, LetterRow, driveItemId, executePlan, lettersSql, classifyDriveLocation, parseArgs, planLetters, validateScope } from '../move-contract-letters-core';

const letter = (id: number, overrides: Partial<LetterRow> = {}): LetterRow => ({
    id, number: `P/${id}`, creationDate: '2026-10-01', projectId: 1,
    sourceLettersFolderId: 'source', offerId: null, gdFolderId: `folder-${id}`, gdDocumentId: `file-${id}`,
    caseId: id, contractId: 10, caseOfferId: null, ...overrides,
});
const plan = (rows: LetterRow[], limit?: number) => planLetters(rows, [10, 11], 2, limit);
const ports = () => ({ targetFolderId: 'target', getMetadata: jest.fn().mockResolvedValue({ parents: ['source'], trashed: false }), moveOnDrive: jest.fn().mockResolvedValue(undefined), updateLetterProject: jest.fn().mockResolvedValue(1) });

test('klasyfikacja wszystkich spraw, ofert, już przepiętych i brakujących relacji; bez duplikatów', () => {
    const result = plan([
        letter(1), letter(1, { caseId: 11, contractId: 11 }),
        letter(2, { offerId: 20 }),
        letter(3), letter(3, { caseId: 30, caseOfferId: 20, contractId: null }),
        letter(4), letter(4, { caseId: 40, contractId: 99 }),
        letter(5, { projectId: 2 }),
        letter(6, { caseId: null, contractId: null }),
        letter(7), letter(7, { caseId: 70, contractId: null }),
        letter(8, { contractId: 99 }),
    ]);
    expect(result.qualifying.map((l) => l.id)).toEqual([1]);
    expect(result.offers.map((l) => l.id)).toEqual([2, 3]);
    expect(result.outsideScope.map((l) => l.id)).toEqual([4, 7]);
    expect(result.alreadyMoved.map((l) => l.id)).toEqual([5]);
});

test.each([
    [{ parents: ['source', 'target'] }, 'source', 'IN_TARGET'],
    [{ parents: ['target'] }, null, 'IN_TARGET'],
    [{ parents: ['source', 'other'] }, 'source', 'IN_SOURCE'],
    [{ parents: ['other'] }, 'source', 'ELSEWHERE'],
    [{ parents: [] }, 'source', 'ELSEWHERE'],
    [{}, 'source', 'ELSEWHERE'],
    [{ parents: ['source'] }, null, 'ELSEWHERE'],
    [{ parents: ['target'], trashed: true }, 'source', 'ELSEWHERE'],
] as const)('czysta klasyfikacja %j, źródło=%s: %s', (metadata, source, expected) => {
    expect(classifyDriveLocation(metadata as { parents?: string[]; trashed?: boolean }, source, 'target').location).toBe(expected);
});

test('Dysk przed bazą; folder ma pierwszeństwo, usuwany jest tylko rodzic źródłowy', async () => {
    const writes = ports();
    writes.getMetadata.mockResolvedValue({ parents: ['source', 'other'] });
    const result = await executePlan(plan([letter(1)]), 2, true, writes);
    expect(writes.moveOnDrive).toHaveBeenCalledWith('folder-1', 'source');
    expect(writes.updateLetterProject).toHaveBeenCalledWith(1, 2, 1);
    expect(writes.moveOnDrive.mock.invocationCallOrder[0]).toBeLessThan(writes.updateLetterProject.mock.invocationCallOrder[0]);
    expect(result.moved).toBe(1);
    expect(driveItemId(letter(1, { gdFolderId: null }))).toBe('file-1');
});

test('IN_TARGET: wznowienie zmienia tylko bazę', async () => {
    const writes = ports();
    writes.getMetadata.mockResolvedValue({ parents: ['target'] });
    const result = await executePlan(plan([letter(1)]), 2, true, writes);
    expect(result.databaseOnly).toBe(1);
    expect(result.moved).toBe(0);
    expect(result.inTarget).toHaveLength(1);
    expect(writes.moveOnDrive).not.toHaveBeenCalled();
    expect(writes.updateLetterProject).toHaveBeenCalledWith(1, 2, 1);
});

test.each([
    [{ parents: ['other'] }, 'source'],
    [{ parents: [] }, 'source'],
    [{ parents: ['source'] }, null],
    [{ parents: ['source'], trashed: true }, 'source'],
] as const)('ELSEWHERE: %j, źródło=%s — zero zapisów', async (metadata, source) => {
    const writes = ports();
    writes.getMetadata.mockResolvedValue(metadata);
    const result = await executePlan(plan([letter(1, { sourceLettersFolderId: source })]), 2, true, writes);
    expect(result.elsewhere).toHaveLength(1);
    expect(result.elsewhere[0].reason).not.toBe('');
    expect(result.errors).toHaveLength(0);
    expect(writes.moveOnDrive).not.toHaveBeenCalled();
    expect(writes.updateLetterProject).not.toHaveBeenCalled();
});

test.each(['404', '403 brak dostępu'])('nieodczytany element: %s — pominięte (d), zero zapisów', async (message) => {
    const writes = ports();
    writes.getMetadata.mockRejectedValue(new Error(message));
    const result = await executePlan(plan([letter(1)]), 2, true, writes);
    expect(result.elsewhere[0].reason).toContain(message);
    expect(writes.moveOnDrive).not.toHaveBeenCalled();
    expect(writes.updateLetterProject).not.toHaveBeenCalled();
});

test('błąd zapisu Dysku nie zmienia bazy i nie przerywa dalszych pism', async () => {
    const writes = ports();
    writes.moveOnDrive.mockRejectedValueOnce(new Error('odmowa Dysku'));
    const result = await executePlan(plan([letter(1), letter(2)]), 2, true, writes);
    expect(writes.updateLetterProject.mock.calls).toEqual([[2, 2, 1]]);
    expect(result.moved).toBe(1);
    expect(result.errors).toEqual([{ id: 1, message: 'odmowa Dysku' }]);
});

test('podgląd czyta metadane, ma te same grupy i liczby co apply, bez zapisów', async () => {
    const selected = plan([letter(1), letter(2), letter(3), letter(4, { gdFolderId: null, gdDocumentId: null })]);
    const writes = ports();
    const metadata = () => writes.getMetadata.mockResolvedValueOnce({ parents: ['source'] })
        .mockResolvedValueOnce({ parents: ['target'] }).mockResolvedValueOnce({ parents: ['other'] });
    metadata();
    const preview = await executePlan(selected, 2, false, writes);
    expect(writes.getMetadata).toHaveBeenCalledTimes(3);
    expect(writes.moveOnDrive).not.toHaveBeenCalled();
    expect(writes.updateLetterProject).not.toHaveBeenCalled();
    metadata();
    expect(await executePlan(selected, 2, true, writes)).toEqual(preview);
    expect(preview.moved).toBe(1);
    expect(preview.databaseOnly).toBe(2);
    expect(preview.withoutDriveId).toHaveLength(1);
    expect(writes.updateLetterProject.mock.calls).toEqual([[1, 2, 1], [2, 2, 1], [4, 2, 1]]);
});

test('--no-drive-check nie odczytuje Dysku ani nie przypisuje niezweryfikowanych pism do przenosin', async () => {
    const writes = ports();
    const result = await executePlan(plan([letter(1)]), 2, false, writes, true);
    expect(result.unchecked).toHaveLength(1);
    expect(result.moved).toBe(0);
    expect(writes.getMetadata).not.toHaveBeenCalled();
    expect(writes.moveOnDrive).not.toHaveBeenCalled();
    expect(writes.updateLetterProject).not.toHaveBeenCalled();
    await expect(executePlan(plan([letter(1)]), 2, true, writes, true)).rejects.toThrow('wyłącznie w podglądzie');
});

test('UPDATE z 0 wierszy jest błędem pisma i nie powiększa liczb powodzeń', async () => {
    const writes = ports();
    writes.updateLetterProject.mockResolvedValueOnce(0);
    const result = await executePlan(plan([letter(1), letter(2)]), 2, true, writes);
    expect(result.errors[0]).toMatchObject({ id: 1, message: expect.stringContaining('ProjectId zmienił się') });
    expect(result.moved).toBe(1);
});

test('limit dotyczy unikalnych kwalifikujących się pism, w kolejności Id', async () => {
    const selected = plan([letter(3), letter(1), letter(1), letter(2, { projectId: 2 })], 1);
    expect(selected.qualifying).toHaveLength(2);
    expect(selected.selected.map((l) => l.id)).toEqual([1]);
    const writes = ports();
    await executePlan(selected, 2, true, writes);
    expect(writes.updateLetterProject.mock.calls).toEqual([[1, 2, 1]]);
});

test('wznowienie po błędzie bazy: Dysk już na miejscu, dokończenie bazy', async () => {
    const writes = ports();
    writes.updateLetterProject.mockRejectedValueOnce(new Error('DB niedostępna'));
    const selected = plan([letter(1)]);
    expect((await executePlan(selected, 2, true, writes)).errors).toHaveLength(1);
    writes.getMetadata.mockResolvedValue({ parents: ['target'] });
    expect((await executePlan(selected, 2, true, writes)).databaseOnly).toBe(1);
    expect(writes.moveOnDrive).toHaveBeenCalledTimes(1);
    await executePlan(plan([letter(1, { projectId: 2 })]), 2, true, writes);
    expect(writes.getMetadata).toHaveBeenCalledTimes(2);
    expect(writes.updateLetterProject).toHaveBeenCalledTimes(2);
});

test('rozjazd projektów umów podległych przerywa planowanie', () => {
    const root: ContractScopeRow = { id: 10, number: 'U/10', name: 'Inżynier', projectOurId: 'P2' };
    expect(validateScope([root, { ...root, id: 11 }], 10)).toBe('P2');
    expect(() => validateScope([root, { ...root, id: 11, projectOurId: 'P1' }], 10)).toThrow('11');
    expect(() => validateScope([], 10)).toThrow('Nie znaleziono');
});

test('CLI wymaga dodatniego bezpiecznego Id, domyślnie podgląd; apply i limit', () => {
    expect(parseArgs(['--contractId=10'])).toEqual({ contractId: 10, apply: false, limit: undefined, noDriveCheck: false });
    expect(parseArgs(['--contractId=10', '--apply', '--limit=2'])).toEqual({ contractId: 10, apply: true, limit: 2, noDriveCheck: false });
});

test.each([[], ['--contractId=0'], ['--contractId=1', '--limit=-1'], ['--contractId=1', '--limit=1.5'], ['--contractId=9007199254740992'], ['--contractId=1', '--unknown'], ['--contractId=1', '--contractId=2']].map((args) => [args]))('nieprawidłowe argumenty: %j', (args) => {
    expect(() => parseArgs(args)).toThrow();
});

test('SQL ogranicza zakres przez EXISTS, zachowując wszystkie asocjacje do klasyfikacji', () => {
    const sql = lettersSql(2);
    expect(sql).toContain('scoped_m.ContractId IN (?, ?)');
    expect(sql).toContain('LEFT JOIN Milestones m');
    expect(sql).toContain('LEFT JOIN Projects p ON p.Id = l.ProjectId');
    expect(sql).toContain('p.LettersGdFolderId AS sourceLettersFolderId');
    expect(sql).not.toMatch(/\bAND m\.ContractId IN/);
});

test('--no-drive-check dozwolone tylko dla podglądu', () => {
    expect(parseArgs(['--contractId=10', '--no-drive-check']).noDriveCheck).toBe(true);
    expect(() => parseArgs(['--contractId=10', '--apply', '--no-drive-check'])).toThrow('wyłącznie w podglądzie');
});
