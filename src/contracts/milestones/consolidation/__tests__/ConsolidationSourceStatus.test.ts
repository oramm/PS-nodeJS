jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../ConsolidationOperationRepository');
jest.mock('../ConsolidationPreviewRepository');
jest.mock('../ConsolidationNoteRepository');
import Controller from '../ConsolidationStatusController';
import Operations from '../ConsolidationOperationRepository';
import Participants from '../ConsolidationPreviewRepository';
import ToolsDb from '../../../../tools/ToolsDb';
import Operation from '../ConsolidationOperation';
import Preview from '../ConsolidationPreview';
import { operationFixture } from './operationFixture';
const actor: any = { enviId: 7, systemRoleId: 1 };
const conn = { query: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), destroy: jest.fn() };
let record: ReturnType<typeof Operation.first>, current: any;
beforeEach(() => {
    jest.resetAllMocks();
    conn.query.mockImplementation(async(sql:string)=>sql.includes('FROM PersonAccounts')?[[{PersonId:7,SystemRoleId:1,SystemEmail:'synthetic@example.invalid',IsActive:1}]]:[[]]);
    const fixture = operationFixture(), preview = fixture.make();
    record = Operation.first(Preview.serialize(preview), fixture.body(preview, false), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 7);
    current = { milestones: fixture.snapshot.rows.Milestones, contracts: fixture.snapshot.rows.Contracts, contractIds: fixture.snapshot.rows.Contracts.map((c: any) => c.Id) };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (Operations.prototype.find as jest.Mock).mockImplementation(async()=>record);
    (Operations.prototype.forSource as jest.Mock).mockResolvedValue(record);
    (Participants.prototype.participants as jest.Mock).mockImplementation(async ids => ({ ...current, milestones: current.milestones.filter((m: any) => ids.includes(Number(m.Id))) }));
    (Participants.prototype.contracts as jest.Mock).mockImplementation(async () => current.contracts);
});
it('resumes source operation under read-only transaction and does not claim Drive readiness', async () => {
    const value = await Controller.forSource(String(record.sourceMilestoneId), actor);
    expect(value.operation).toMatchObject({ operationId: record.operationId, state: 'TRANSFERRING', documentsReady: false, cleanup: { verificationComplete: false } });
    expect(Operations.prototype.forSource).toHaveBeenCalledWith(record.sourceMilestoneId, conn);
    expect(conn.query).toHaveBeenCalledWith('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    expect(conn.commit).toHaveBeenCalledTimes(1); expect(conn.release).toHaveBeenCalledTimes(1);
});
it.each([undefined, 4, 5, 6])('preserves management denial for role %s before SQL', async role => {
    await expect(Controller.forSource(String(record.sourceMilestoneId), role ? { ...actor, systemRoleId: role } : undefined)).rejects.toMatchObject({ status: role ? 403 : 401 });
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('returns null only for an accessible source with no durable operation', async () => {
    (Operations.prototype.forSource as jest.Mock).mockResolvedValue(undefined);
    await expect(Controller.forSource(String(record.sourceMilestoneId), actor, { projectOurIds: [record.projectOurId] })).resolves.toEqual({ operation: null });
    await expect(Controller.forSource(String(record.sourceMilestoneId), actor, { projectOurIds: [] })).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
});
it('keeps current and historical participant scope authorization', async () => {
    await expect(Controller.forSource(String(record.sourceMilestoneId), actor, { projectOurIds: [] })).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    (Participants.prototype.contracts as jest.Mock).mockResolvedValue([...current.contracts, { Id: 99, ProjectOurId: 'FOREIGN' }]);
    await expect(Controller.forSource(String(record.sourceMilestoneId), actor)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(conn.rollback).toHaveBeenCalled();
});
it.each(['0', '1.1', '-1', 'bad'])('rejects malformed source %s before SQL', async id => {
    await expect(Controller.forSource(id, actor)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('reads only the requested source without write locks and refuses ambiguous records', async () => {
    const Actual = jest.requireActual('../ConsolidationOperationRepository').default as typeof Operations;
    const query = jest.fn().mockResolvedValue([[record]]), repository = new Actual();
    await expect(repository.forSource(record.sourceMilestoneId, { query } as any)).resolves.toEqual(record);
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('WHERE SourceMilestoneId = ?'); expect(sql).not.toContain('FOR UPDATE'); expect(values).toEqual([record.sourceMilestoneId]);
    query.mockResolvedValue([[record, record]]);
    await expect(repository.forSource(record.sourceMilestoneId, { query } as any)).rejects.toThrow('Ambiguous source consolidation');
});
