jest.mock('../../index', () => ({ app: { post: jest.fn(), put: jest.fn(), patch: jest.fn(), get: jest.fn(), delete: jest.fn() } }));
jest.mock('../InvoicesController', () => ({ __esModule: true, default: { find: jest.fn(async () => []), updateStatus: jest.fn() } }));
jest.mock('../InvoiceItemsController', () => ({ __esModule: true, default: { find: jest.fn(async () => []) } }));
jest.mock('../KSeF', () => ({ KsefController: {} }));
jest.mock('../summarySheet/InvoiceSummarySheetController', () => ({ __esModule: true, default: { generate: jest.fn() } }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: { getQueryCallbackAsync: jest.fn() } }));
jest.mock('../../persons/projectAssignments/ProjectAssignmentRepository', () => ({ __esModule: true, default: { findMembership: jest.fn() } }));

import { app } from '../../index';
import ToolsDb from '../../tools/ToolsDb';
import ProjectAssignmentRepository from '../../persons/projectAssignments/ProjectAssignmentRepository';
import { SystemRoleName } from '../../types/sessionTypes';
import InvoicesController from '../InvoicesController';
import { salesInvoiceAccess, salesInvoicesScopedForRole } from '../salesInvoiceScope';

const db = ToolsDb.getQueryCallbackAsync as jest.Mock;
const membership = ProjectAssignmentRepository.findMembership as jest.Mock;
const originalFlag = process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES;
const routes = new Map<string, any[]>();

beforeAll(() => {
    require('../InvoicesRouters');
    require('../InvoiceItemsRouters');
    require('../summarySheet/InvoiceSummarySheetRouters');
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const)
        for (const [path, ...handlers] of (app[method] as jest.Mock).mock.calls)
            routes.set(`${method} ${path}`, handlers);
});
afterAll(() => {
    if (originalFlag === undefined) delete process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES;
    else process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES = originalFlag;
});
beforeEach(() => {
    process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES = 'true';
    membership.mockResolvedValue([]);
    db.mockResolvedValue([]);
});
const req = (body: any = {}, role = SystemRoleName.ENVI_EMPLOYEE): any => ({
    params: { id: '10' }, body, parsedBody: body,
    session: { userData: { enviId: 7, systemRoleName: role } },
});
async function run(guard: any, request = req()) {
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    await guard(request, res, next);
    return { request, res, next };
}

it('rola w kontrakcie zawęża listę faktur do tego kontraktu', async () => {
    membership.mockResolvedValue([{ personId: 7, projectOurId: 'A', contractId: 11 }]);
    const [guard, handler] = routes.get('post /invoices')!;
    const { request, res, next } = await run(guard, req({ orConditions: [] }));
    expect(next).toHaveBeenCalledWith();
    await handler(request, res, next);
    expect(InvoicesController.find).toHaveBeenCalledWith([], true, { projectOurIds: [], contractIds: [11] });
    expect(membership).toHaveBeenCalledWith({ personId: 7 });
});
it('przypisanie do projektu obejmuje wszystkie jego kontrakty, bez krawędzi innej osoby', async () => {
    membership.mockResolvedValue([{ personId: 7, projectOurId: 'A', contractId: null }, { personId: 8, projectOurId: 'B', contractId: 99 }]);
    const { request } = await run(salesInvoiceAccess('list'));
    expect(request.salesInvoiceScope).toEqual({ projectOurIds: ['A'], contractIds: [] });
});
it('bez członkostwa lista ma pusty zakres, a nie brak filtra', async () => {
    const { request } = await run(salesInvoiceAccess('list'));
    expect(request.salesInvoiceScope).toEqual({ projectOurIds: [], contractIds: [] });
});
it.each([
    'get /invoice/:id/ksef/xml', 'get /invoice/:id/ksef/status', 'get /invoice/:id/ksef/upo',
    'get /invoice/:id/ksef/xml-preview', 'put /setAsPaidInvoice/:id', 'put /setAsSentInvoice/:id',
    'put /setAsToMakeInvoice/:id', 'put /invoice/:id', 'delete /invoice/:id', 'patch /invoices/:id/payment',
    'post /invoice/:id/ksef/send', 'post /invoice/:id/ksef/correction',
    'put /invoiceItem/:id', 'delete /invoiceItem/:id',
])('%s: brak członkostwa daje 403 przed odczytem lub zapisem', async (route) => {
    const { res, next } = await run(routes.get(route)![0]);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith({ errorMessage: expect.stringContaining('Brak uprawnień') });
    expect(next).not.toHaveBeenCalled();
    expect(InvoicesController.updateStatus).not.toHaveBeenCalled();
});
it.each([SystemRoleName.ENVI_MANAGER, SystemRoleName.ADMIN])('%s widzi wszystko bez odpytywania przypisań', async (role) => {
    const { request, next } = await run(salesInvoiceAccess('invoice'), req({}, role));
    expect(next).toHaveBeenCalledWith();
    expect(request.salesInvoiceScope).toBeUndefined();
    expect(membership).not.toHaveBeenCalled();
    expect(db).not.toHaveBeenCalled();
});
it.each([undefined, 'false', 'TRUE', '1'])('flaga %s zachowuje pełny dostęp pracownika', async (flag) => {
    if (flag === undefined) delete process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES;
    else process.env.SALES_INVOICES_SCOPED_FOR_EMPLOYEES = flag;
    const { request, next } = await run(salesInvoiceAccess('invoice'));
    expect(next).toHaveBeenCalledWith();
    expect(request.salesInvoiceScope).toBeUndefined();
    expect(membership).not.toHaveBeenCalled();
    expect(salesInvoicesScopedForRole(SystemRoleName.ENVI_EMPLOYEE)).toBe(false);
});
it('członek kontraktu przechodzi odczyt, a SQL sprawdza rzeczywistą fakturę', async () => {
    membership.mockResolvedValue([{ personId: 7, projectOurId: 'A', contractId: 11 }]);
    db.mockResolvedValue([{}]);
    const { next } = await run(salesInvoiceAccess('invoice'));
    expect(next).toHaveBeenCalledWith();
    expect(db).toHaveBeenCalledWith(expect.stringContaining('Contracts.Id IN (11)'), undefined, [10]);
});
it('podmiana id w body nie omija sprawdzenia faktury', async () => {
    db.mockResolvedValueOnce([{}]).mockResolvedValue([]);
    const { res, next } = await run(salesInvoiceAccess('invoice'), req({ id: 99 }));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(db.mock.calls[1][2]).toEqual([99]);
});
it.each([
    ['newInvoice', { _contract: { id: 99 } }],
    ['copyInvoice', { id: 99, _contract: { id: 11 } }],
    ['series', { sourceInvoiceId: 99 }],
    ['newItem', { _parent: { id: 99 } }],
    ['summary', { contractId: 99 }],
] as const)('%s odmawia operacji poza zakresem', async (operation, body) => {
    const { res, next } = await run(salesInvoiceAccess(operation), req(body));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
});
it('edycja pozycji sprawdza także nową fakturę nadrzędną', async () => {
    db.mockResolvedValueOnce([{}]).mockResolvedValue([]);
    const { res } = await run(salesInvoiceAccess('item'), req({ _parent: { id: 99 } }));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.mock.calls[1][2]).toEqual([99]);
});
it('multipart: sprawdza kontrakt z pola JSON przed wystawieniem faktury', async () => {
    db.mockResolvedValueOnce([{}]).mockResolvedValue([]);
    const request = req({ _contract: JSON.stringify({ id: 99 }) });
    request.parsedBody = {};
    const { res } = await run(salesInvoiceAccess('invoice'), request);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.mock.calls[1][2]).toEqual([99]);
});
it('błąd bazy zatrzymuje żądanie i trafia do obsługi błędów', async () => {
    const error = new Error('Awaria bazy');
    membership.mockRejectedValueOnce(error);
    const { next } = await run(salesInvoiceAccess('list'));
    expect(next).toHaveBeenCalledWith(error);
});

it.each([
    ['post /invoices', { id: 99 }],
    ['post /invoiceItems', { invoiceItemId: 99 }],
    ['post /invoiceItems', { invoiceId: 99 }],
])('%s: odczyt szczegółów przez trasę listy też zwraca 403', async (route, condition) => {
    const { res, next } = await run(routes.get(route as string)![0], req({ orConditions: [condition] }));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
});
