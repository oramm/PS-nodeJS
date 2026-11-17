jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: { getQueryCallbackAsync: jest.fn() } }));
jest.mock('../../persons/projectAssignments/ProjectAssignmentRepository', () => ({ __esModule: true, default: { getAssignedProjectOurIds: jest.fn() } }));
jest.mock('../ScrumboardEvents', () => ({ __esModule: true, default: { broadcast: jest.fn(), subscribe: jest.fn() } }));
jest.mock('../contractStatuses/ScrumboardContractStatusesController', () => ({}));
jest.mock('../taskHours/ScrumboardTaskHoursController', () => ({ __esModule: true, default: { updateHours: jest.fn() } }));
jest.mock('../planning/ScrumboardPlanningController', () => ({}));
jest.mock('../summary/ScrumboardSummaryController', () => ({}));
jest.mock('../report/ScrumboardReportController', () => ({}));
jest.mock('../vacations/ScrumboardVacationsController', () => ({}));
jest.mock('../ScrumboardPersons', () => ({}));
jest.mock('../../contracts/milestones/cases/tasks/TasksController', () => ({}));
import { app } from '../../index';
import ToolsDb from '../../tools/ToolsDb';
import Hours from '../taskHours/ScrumboardTaskHoursController';
import Events from '../ScrumboardEvents';
import policy from '../../setup/Sessions/projectScopedPolicy';
import { SystemRoleName } from '../../types/sessionTypes';
import '../ScrumboardRouters';
const [, session, handler] = (app.put as jest.Mock).mock.calls.find(([url]) => url === '/scrumboard/task/:id/hours')!;
function request(body: any = { id: 99, hoursMon: 2 }, id = '12') {
    return { params: { id }, parsedBody: body, session: { userData: { systemRoleName: SystemRoleName.ENVI_EMPLOYEE } },
        method: 'PUT', path: `/scrumboard/task/${id}/hours`, projectScope: undefined } as any;
}
function response() { const res: any = { send: jest.fn(), status: jest.fn() }; res.status.mockReturnValue(res); return res; }
const result = { estimatedHours: 8, hoursMon: 2, hoursTue: null, hoursWed: 0, hoursThu: 1, hoursFri: null, weekSum: 3 };
beforeEach(() => {
    jest.clearAllMocks();
    (Hours.updateHours as jest.Mock).mockReset().mockResolvedValue(result);
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset().mockResolvedValue([{ ProjectOurId: 'P1' }]);
});
it.each([{ id: 99, hoursMon: 2 }, { hoursMon: 2 }])('uses URL identity and only validated hours: %j', async body => {
    const req = request(body), res = response(), next = jest.fn();
    await handler(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Hours.updateHours).toHaveBeenCalledWith(12, { hoursMon: 2 });
    expect(Events.broadcast).toHaveBeenCalledWith('task-hours-changed', { taskId: 12, ...result });
    expect(res.send).toHaveBeenCalledWith(result);
    expect(body).not.toHaveProperty('id', 12);
});
it('preserves zero, null and omitted fields', async () => {
    await handler(request({ hoursMon: 0, hoursTue: null }), response(), jest.fn());
    expect(Hours.updateHours).toHaveBeenCalledWith(12, { hoursMon: 0, hoursTue: null });
});
it.each(['0', '-1', '1.5', 'bad'])('rejects invalid URL ID %s before access or write', async id => {
    const next = jest.fn();
    await handler(request(undefined, id), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    expect(Hours.updateHours).not.toHaveBeenCalled();
    expect(Events.broadcast).not.toHaveBeenCalled();
});
it.each([{}, { hoursMon: -1 }, { hoursMon: 'invalid' }])('rejects invalid hours: %j', async body => {
    const next = jest.fn();
    await handler(request(body), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    expect(Hours.updateHours).not.toHaveBeenCalled();
    expect(Events.broadcast).not.toHaveBeenCalled();
});
it('checks persisted URL task scope before write, ignoring forged context', async () => {
    const req = request({ id: 99, hoursMon: 2, _case: { id: 200, projectOurId: 'forged' } });
    req.projectScope = { projectOurIds: ['P1'] };
    const next = jest.fn(); await handler(req, response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE t.Id = ?'), undefined, [12]);
    expect((ToolsDb.getQueryCallbackAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((Hours.updateHours as jest.Mock).mock.invocationCallOrder[0]);
    expect(Hours.updateHours).toHaveBeenCalledWith(12, { hoursMon: 2 });
});
it.each([[[]], [[{ ProjectOurId: 'OTHER' }]]])('refuses missing or out-of-scope task: %j', async rows => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue(rows);
    const req = request(), next = jest.fn(), res = response(); req.projectScope = { projectOurIds: ['P1'] };
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(Hours.updateHours).not.toHaveBeenCalled(); expect(Events.broadcast).not.toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled();
});
it('refuses empty project scope', async () => {
    const req = request(), next = jest.fn(); req.projectScope = { projectOurIds: [] };
    await handler(req, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(Hours.updateHours).not.toHaveBeenCalled(); expect(Events.broadcast).not.toHaveBeenCalled();
});
it('propagates access storage failure without writing', async () => {
    const error = new Error('synthetic query failure'); (ToolsDb.getQueryCallbackAsync as jest.Mock).mockRejectedValue(error);
    const req = request(), next = jest.fn(); req.projectScope = { projectOurIds: ['P1'] };
    await handler(req, response(), next);
    expect(next).toHaveBeenCalledWith(error); expect(Hours.updateHours).not.toHaveBeenCalled(); expect(Events.broadcast).not.toHaveBeenCalled();
});
it('does not announce a failed write', async () => {
    const error = new Error('synthetic write failure'); (Hours.updateHours as jest.Mock).mockRejectedValue(error);
    const next = jest.fn(), res = response(); await handler(request(), res, next);
    expect(next).toHaveBeenCalledWith(error); expect(Events.broadcast).not.toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled();
});
it('refuses requests without session', () => {
    const req = request(), res = response(), next = jest.fn(); req.session = {};
    session(req, res, next); expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled(); expect(Hours.updateHours).not.toHaveBeenCalled();
});
it.each([SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT])('preserves global refusal for %s', async role => {
    const req = request(), res = response(), next = jest.fn(); req.session.userData.systemRoleName = role;
    await policy(req, res, next); expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled(); expect(Hours.updateHours).not.toHaveBeenCalled();
});
it.each([SystemRoleName.ADMIN, SystemRoleName.ENVI_MANAGER, SystemRoleName.ENVI_EMPLOYEE])('preserves ordinary access for %s', async role => {
    const req = request(), res = response(), next = jest.fn(); req.session.userData.systemRoleName = role;
    await policy(req, res, next); expect(next).toHaveBeenCalledTimes(1);
    next.mockClear(); session(req, res, next); expect(next).toHaveBeenCalledTimes(1);
    await handler(req, res, jest.fn()); expect(Hours.updateHours).toHaveBeenCalledTimes(1);
});
