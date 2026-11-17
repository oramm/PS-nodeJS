jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../ConsolidationPreviewRepository');
jest.mock('../ConsolidationEffectsRepository');
import Controller from '../ConsolidationPreviewController';
import ToolsDb from '../../../../tools/ToolsDb';
import Repository from '../ConsolidationPreviewRepository';
import Reader from '../ConsolidationEffectsRepository';
import Preview from '../ConsolidationPreview';
import AccessController from '../ConsolidationAccessController';
import Router from '../ConsolidationPreviewRouters';
import express from 'express';
import type { AddressInfo } from 'net';
const schema = require('./effectsSchemaFixture.json');
const user: any = { enviId: 7, systemRoleId: 1 };
const req = { sourceMilestoneId: 1, destinationMilestoneId: 2, mappings: [] };
let s: any, headers: Map<string, any>, payloads: Map<string, string>, participants: any;
const conn = { query: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
beforeEach(() => {
    jest.clearAllMocks();
    s = { ...JSON.parse(JSON.stringify(schema)), projectOurId: 'P', boundaryReferences: 0,
        parentScopeExpression: 'ifnull(`ParentCaseId`,0)', nameWeights: [], folderReferences: [], folderReferenceScope: 'SELECTED_PROJECT_ONLY',
        rows: { Projects: [{ Id: 7, OurId: 'P' }], Contracts: [{ Id: 10, ProjectOurId: 'P', TypeId: 1 }, { Id: 20, ProjectOurId: 'P', TypeId: 1 }],
            Milestones: [{ Id: 1, ContractId: 10, TypeId: 5, Description: 'ą'.repeat(140000) }, { Id: 2, ContractId: 20, TypeId: 5 }],
            Cases: [], Tasks: [], ProcessInstances: [], MilestoneContractLinks: [], CaseTypes: [], CaseType_SubCaseTypes: [],
            MilestoneTypes_ContractTypes: [{ MilestoneTypeId: 5, ContractTypeId: 1 }] } };
    participants = { milestones: s.rows.Milestones, links: [], contractIds: [10, 20], contracts: s.rows.Contracts };
    headers = new Map(); payloads = new Map();
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (Repository.prototype.participants as jest.Mock).mockImplementation(async () => participants);
    (Repository.prototype.contracts as jest.Mock).mockImplementation(async () => s.rows.Contracts);
    (Repository.prototype.header as jest.Mock).mockImplementation(async id => headers.get(id));
    (Repository.prototype.content as jest.Mock).mockImplementation(async id => payloads.get(id));
    (Reader.prototype.readEffects as jest.Mock).mockImplementation(async () => s);
    (Repository.prototype.add as jest.Mock).mockImplementation(async (p: ReturnType<typeof Preview.create>) => {
        headers.set(p.previewId, { PreviewId: p.previewId, ActorId: p.content.scope.actorId, ProjectOurId: 'P',
            SourceMilestoneId: 1, DestinationMilestoneId: 2, Revision: p.revision });
        payloads.set(p.previewId, Preview.serialize(p));
    });
});
it('commits only snapshot and reads the same identity with current authorization', async () => {
    const p = await Controller.addFromDto(req, user, { projectOurIds: ['P'] });
    const read = await Controller.get(p.previewId, { ...user, enviId: 8 }, { projectOurIds: ['P'] });
    expect(read).toEqual(p); expect(p.transferReady).toBe(false);
    expect(Repository.prototype.add).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(2);
    expect(conn.query).toHaveBeenCalledWith('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
});
it.each([undefined, { ...user, systemRoleId: 4 }, { ...user, systemRoleId: 6 }])('denies actor before SQL %#', async actor => {
    await expect(Controller.addFromDto(req, actor)).rejects.toMatchObject({ status: actor ? 403 : 401 });
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('denies restricted scope before content read or save', async () => {
    await expect(Controller.addFromDto(req, user, { projectOurIds: [] })).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    expect(Reader.prototype.readEffects).not.toHaveBeenCalled(); expect(Repository.prototype.add).not.toHaveBeenCalled();
});
it('hides missing and foreign previews without reading their payload', async () => {
    const p = await Controller.addFromDto(req, user);
    await expect(Controller.get(p.previewId, user, { projectOurIds: [] })).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    await expect(Controller.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(Repository.prototype.content).not.toHaveBeenCalled();
});
it('checks a newly linked participant before loading saved content', async () => {
    const p = await Controller.addFromDto(req, user);
    participants.contractIds.push(30); participants.contracts.push({ Id: 30, ProjectOurId: 'FOREIGN' });
    await expect(Controller.get(p.previewId, user, { projectOurIds: ['P'] })).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    expect(Repository.prototype.content).not.toHaveBeenCalled();
});
it('checks original participants after their link disappears', async () => {
    const p = await Controller.addFromDto(req, user);
    (Repository.prototype.contracts as jest.Mock).mockResolvedValue([{ Id: 10, ProjectOurId: 'P' }, { Id: 20, ProjectOurId: 'FOREIGN' }]);
    await expect(Controller.get(p.previewId, user, { projectOurIds: ['P'] })).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
});
it('rejects changed full content without a timestamp change', async () => {
    const p = await Controller.addFromDto(req, user);
    s.rows.Milestones[0].Description = 'ą'.repeat(139999) + 'b';
    await expect(Controller.get(p.previewId, user)).rejects.toMatchObject({ code: 'STALE_REVISION' });
});
it('authorizes a saved preview without revalidating live content, so replay remains possible', async () => {
    const p = await Controller.addFromDto(req, user);
    s.rows.Milestones[0].Description = 'changed after the previous commit';
    (Reader.prototype.readEffects as jest.Mock).mockClear();
    (ToolsDb.pool.getConnection as jest.Mock).mockClear();
    const result = await AccessController.getSaved(p.previewId, { ...user, enviId: 8 }, { projectOurIds: ['P'] }, conn as any);
    expect(result.saved.revision).toBe(p.revision);
    expect(result.saved.content.scope.actorId).toBe(7);
    expect(Reader.prototype.readEffects).not.toHaveBeenCalled();
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
    expect(Repository.prototype.header).toHaveBeenLastCalledWith(p.previewId, conn);
    expect(Repository.prototype.content).toHaveBeenLastCalledWith(p.previewId, conn);
    expect(Repository.prototype.contracts).toHaveBeenLastCalledWith([10, 20], conn);
});
it('rejects original participants moved together to another project even for unrestricted staff', async () => {
    const p = await Controller.addFromDto(req, user);
    (Repository.prototype.contracts as jest.Mock).mockResolvedValue([{ Id: 10, ProjectOurId: 'Q' }, { Id: 20, ProjectOurId: 'Q' }]);
    await expect(AccessController.getSaved(p.previewId, user, undefined, conn as any)).rejects.toMatchObject({ code: 'SNAPSHOT_INTEGRITY_ERROR' });
});
it('rejects deleted original participants and does not return stored content', async () => {
    const p = await Controller.addFromDto(req, user);
    (Repository.prototype.contracts as jest.Mock).mockResolvedValue([{ Id: 10, ProjectOurId: 'P' }]);
    await expect(AccessController.getSaved(p.previewId, user, undefined, conn as any)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
});
it('refuses changed persisted payload instead of trusting its participant list', async () => {
    const p = await Controller.addFromDto(req, user);
    const tampered = JSON.parse(payloads.get(p.previewId)!);
    tampered.content.scope.participantContractIds = [10];
    payloads.set(p.previewId, JSON.stringify(tampered));
    await expect(AccessController.getSaved(p.previewId, user, undefined, conn as any)).rejects.toMatchObject({ code: 'SNAPSHOT_INTEGRITY_ERROR' });
});
it('rejects wrong expected revision and invalid request fields', async () => {
    const p = await Controller.addFromDto(req, user);
    await expect(Controller.get(p.previewId, user, undefined, { expectedRevision: '0'.repeat(64) })).rejects.toMatchObject({ code: 'STALE_REVISION' });
    await expect(Controller.addFromDto({ ...req, projectOurId: 'FORGED' }, user)).rejects.toMatchObject({ code: 'INVALID_MAPPING' });
    await expect(Controller.get(p.previewId, user, undefined, {})).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
});
it('rolls back a failed write and exposes no SQL or snapshot in the error', async () => {
    (Repository.prototype.add as jest.Mock).mockRejectedValueOnce(new Error('private SQL content'));
    await expect(Controller.addFromDto(req, user)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(conn.rollback).toHaveBeenCalledTimes(1); expect(conn.commit).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledTimes(1);
});
it('serves the real router locally, preserves identity and refuses an empty revalidation', async () => {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.session = { userData: user } as any; next(); }); app.use(Router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        const created = await fetch(url + '/milestone-consolidations/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        expect(created.status).toBe(200); const p: any = await created.json();
        const get = await fetch(url + '/milestone-consolidations/previews/' + p.previewId);
        expect(get.status).toBe(200); expect(await get.json()).toEqual(p);
        const empty = await fetch(url + '/milestone-consolidations/previews/' + p.previewId + '/revalidate', { method: 'POST' });
        expect(empty.status).toBe(400); expect(await empty.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
