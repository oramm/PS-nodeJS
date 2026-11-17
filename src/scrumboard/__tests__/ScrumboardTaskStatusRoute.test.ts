jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: { getQueryCallbackAsync: jest.fn() } }));
jest.mock('../../persons/projectAssignments/ProjectAssignmentRepository', () => ({ __esModule: true, default: { getAssignedProjectOurIds: jest.fn() } }));
jest.mock('../ScrumboardEvents', () => ({ __esModule: true, default: { broadcast: jest.fn(), subscribe: jest.fn() } }));
jest.mock('../contractStatuses/ScrumboardContractStatusesController', () => ({}));
jest.mock('../taskHours/ScrumboardTaskHoursController', () => ({}));
jest.mock('../planning/ScrumboardPlanningController', () => ({}));
jest.mock('../summary/ScrumboardSummaryController', () => ({}));
jest.mock('../report/ScrumboardReportController', () => ({}));
jest.mock('../vacations/ScrumboardVacationsController', () => ({}));
jest.mock('../ScrumboardPersons', () => ({}));
jest.mock('../../contracts/milestones/cases/tasks/TasksController', () => ({ __esModule: true, default: { edit: jest.fn() } }));

import { app } from '../../index';
import ToolsDb from '../../tools/ToolsDb';
import Tasks from '../../contracts/milestones/cases/tasks/TasksController';
import Events from '../ScrumboardEvents';
import Setup from '../../setup/Setup';
import policy from '../../setup/Sessions/projectScopedPolicy';
import { SystemRoleName } from '../../types/sessionTypes';
import '../ScrumboardRouters';

const route = (app.put as jest.Mock).mock.calls.find(([url]) => url === '/scrumboard/task/:id/status')!;
const [, session, handler] = route;
const status = Object.values(Setup.TaskStatus)[0];
function request(body: any = { id: 99, status }, id = '12') {
    return { params: { id }, parsedBody: body, session: { userData: { systemRoleName: SystemRoleName.ENVI_EMPLOYEE } },
        method: 'PUT', path: `/scrumboard/task/${id}/status`, projectScope: undefined } as any;
}
function response() { const res: any = { send: jest.fn(), status: jest.fn() }; res.status.mockReturnValue(res); return res; }
beforeEach(() => {
    jest.clearAllMocks();
    (Tasks.edit as jest.Mock).mockReset().mockImplementation(async payload => ({ ...payload, status }));
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset().mockResolvedValue([{ ProjectOurId: 'P1' }]);
});

it.each([{ id: 99, status }, { status }])('uses URL identity despite a conflicting or absent body ID: %j', async body => {
    const req = request(body), res = response(), next = jest.fn();
    await handler(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Tasks.edit).toHaveBeenCalledWith({ ...body, id: 12 }, ['status']);
    expect(body).not.toHaveProperty('id', 12);
    expect(Events.broadcast).toHaveBeenCalledWith('task-status-changed', { taskId: 12, status });
    expect(res.send).toHaveBeenCalledWith({ ...body, id: 12 });
});
it.each(['0', '-1', '1.5', 'bad'])('rejects invalid URL ID %s before access query or editing', async id => {
    const next = jest.fn();
    await handler(request(undefined, id), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    expect(Tasks.edit).not.toHaveBeenCalled();
    expect(Events.broadcast).not.toHaveBeenCalled();
});
it('rejects an invalid status before access query or editing', async () => {
    const next = jest.fn();
    await handler(request({ status: 'invalid' }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    expect(Tasks.edit).not.toHaveBeenCalled();
    expect(Events.broadcast).not.toHaveBeenCalled();
});
it('checks the persisted URL task against supplied scope before editing', async () => {
    const req = request({ id: 99, status, _case: { id: 200, projectOurId: 'forged' } });
    req.projectScope = { projectOurIds: ['P1'] };
    await handler(req, response(), jest.fn());
    expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE t.Id = ?'), undefined, [12]);
    expect((ToolsDb.getQueryCallbackAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((Tasks.edit as jest.Mock).mock.invocationCallOrder[0]);
    expect(Tasks.edit).toHaveBeenCalledWith({ ...req.parsedBody, id: 12 }, ['status']);
});
it.each([[[]], [[{ ProjectOurId: 'OTHER' }]]])('refuses missing or out-of-scope persisted task: %j', async rows => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue(rows);
    const req = request(), next = jest.fn(), res = response();
    req.projectScope = { projectOurIds: ['P1'] };
    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(Tasks.edit).not.toHaveBeenCalled();
    expect(Events.broadcast).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
});
it('propagates access storage failure without writing or broadcasting', async () => {
    const error = new Error('synthetic query failure');
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockRejectedValue(error);
    const req = request(), next = jest.fn(); req.projectScope = { projectOurIds: ['P1'] };
    await handler(req, response(), next);
    expect(next).toHaveBeenCalledWith(error);
    expect(Tasks.edit).not.toHaveBeenCalled();
    expect(Events.broadcast).not.toHaveBeenCalled();
});
it('does not announce a failed write', async () => {
    const error = new Error('synthetic write failure');
    (Tasks.edit as jest.Mock).mockRejectedValue(error);
    const next = jest.fn(), res = response();
    await handler(request(), res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(Events.broadcast).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
});
it('refuses requests without a session', () => {
    const req = request(), res = response(), next = jest.fn(); req.session = {};
    session(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(Tasks.edit).not.toHaveBeenCalled();
});
it.each([SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT])('preserves global route refusal for %s', async role => {
    const req = request(), res = response(), next = jest.fn(); req.session.userData.systemRoleName = role;
    await policy(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(Tasks.edit).not.toHaveBeenCalled();
});
it.each([SystemRoleName.ADMIN, SystemRoleName.ENVI_MANAGER, SystemRoleName.ENVI_EMPLOYEE])('preserves ordinary access for %s', async role => {
    const req = request(), res = response(), next = jest.fn(); req.session.userData.systemRoleName = role;
    await policy(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    next.mockClear(); session(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    await handler(req, res, jest.fn());
    expect(Tasks.edit).toHaveBeenCalledTimes(1);
});
