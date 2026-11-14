import { inspect } from 'util';
import { app } from '../../index';
import MailboxController, { mailboxAddress } from '../MailboxController';
import { MailboxRecord } from '../MailboxRepository';
import DirectAdminGateway from '../directAdminGateway';
import ContractsController from '../../contracts/ContractsController';
import ProjectsController from '../../projects/ProjectsController';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import ToolsDb from '../../tools/ToolsDb';
import ToolsMail from '../../tools/ToolsMail';
import Tools from '../../tools/Tools';
import SbAccessController from '../../sbAccess/SbAccessController';
import SbAccessRepository from '../../sbAccess/SbAccessRepository';
import ContractSelectedPersonsRepository from '../../contracts/ContractSelectedPersonsRepository';

jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: { transaction: jest.fn(), executeSQL: jest.fn(), getQueryCallbackAsync: jest.fn() } }));
jest.mock('../../tools/ToolsMail', () => ({ __esModule: true, default: { sendServerErrorReport: jest.fn() } }));
jest.mock('../../sbAccess/SbAccessController', () => ({ __esModule: true, default: { canManage: jest.fn() } }));
jest.mock('../../sbAccess/SbAccessRepository', () => ({ __esModule: true, default: jest.fn(() => ({ getPersonAccount: jest.fn(), getByPersonId: jest.fn() })) }));
jest.mock('../directAdminGateway', () => ({ ...jest.requireActual('../directAdminGateway'), __esModule: true, default: {
    create: jest.fn(), changePassword: jest.fn(), setAgentCopy: jest.fn(), accountExists: jest.fn(),
} }));
jest.mock('../MailboxRepository', () => ({ __esModule: true, default: jest.fn(() => ({
    find: jest.fn(), get: jest.fn(), forOwner: jest.fn(), addressExists: jest.fn(), reserve: jest.fn(),
    setState: jest.fn(), setAgentCopyState: jest.fn(), project: jest.fn(), contract: jest.fn(), moveToProject: jest.fn(), findWithAssignees: jest.fn(),
})) }));
jest.mock('../../contracts/ContractsController', () => ({ __esModule: true, default: {
    find: jest.fn(), createContractFromDto: jest.fn(), addWithAuth: jest.fn(), editWithAuth: jest.fn(), deleteWithAuth: jest.fn(),
} }));
jest.mock('../../projects/ProjectsController', () => ({ __esModule: true, default: { find: jest.fn(), addFromDto: jest.fn(), editFromDto: jest.fn(), delete: jest.fn() } }));
jest.mock('../../contracts/chatSpaces/ChatSpacesController', () => ({ __esModule: true, default: {
    parseSelection: jest.fn(() => ({ mode: 'none' })), provisionAfterContractCreation: jest.fn(),
} }));
jest.mock('../../contracts/ContractsWithChildrenController', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../../contracts/ContractsSettlementController', () => ({ __esModule: true, default: { getSums: jest.fn() } }));
jest.mock('../../ScrumSheet/ScrumSheet', () => ({ __esModule: true, default: {} }));

describe('MBX-3 rejestracja i trasy (prawdziwy kontroler i TaskStore, atrapy DB i poczty)', () => {
    const repository = (MailboxController as any).repository;
    let handlers: Record<string, any>;
    let rows: MailboxRecord[];
    let savedContracts: number[];
    let savedProjects: number[];
    let background: Promise<unknown> | undefined;
    let logs: jest.SpyInstance[];

    beforeAll(() => {
        require('../../contracts/ContractsRouters');
        require('../../projects/ProjectsRouters');
        require('../MailboxRouters');
        handlers = {};
        for (const method of ['get', 'post', 'put'] as const)
            for (const [path, handler] of (app[method] as jest.Mock).mock.calls)
                handlers[`${method} ${path}`] = handler;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        rows = [];
        savedContracts = [];
        savedProjects = [];
        background = undefined;
        logs = ['log', 'warn', 'error', 'info', 'debug'].map(method => jest.spyOn(console, method as 'log').mockImplementation());
        jest.spyOn(global, 'setImmediate').mockImplementation(((callback: () => unknown) => {
            background = Promise.resolve().then(callback);
            return 0 as any;
        }) as any);
        (ToolsDb.transaction as jest.Mock).mockImplementation(async callback => callback({}));
        (ToolsMail.sendServerErrorReport as jest.Mock).mockResolvedValue(undefined);
        (DirectAdminGateway.create as jest.Mock).mockResolvedValue(undefined);
        (DirectAdminGateway.changePassword as jest.Mock).mockResolvedValue(undefined);
        (DirectAdminGateway.setAgentCopy as jest.Mock).mockResolvedValue(undefined);
        (SbAccessController.canManage as jest.Mock).mockResolvedValue(false);
        (SbAccessRepository as jest.Mock).mockImplementation(() => ({
            getPersonAccount: jest.fn().mockResolvedValue({ isActive: true }),
            getByPersonId: jest.fn().mockResolvedValue({ levels: { mail: ['manual'] } }),
        }));
        repository.find.mockImplementation(async () => rows.map(row => ({ ...row })));
        repository.get.mockImplementation(async (id: number) => rows.find(row => row.id === id));
        repository.forOwner.mockImplementation(async (projectId: number | null, contractId: number | null) => rows.find(row =>
            contractId ? row.contractId === contractId : row.projectId === projectId));
        repository.addressExists.mockResolvedValue(false);
        repository.project.mockResolvedValue({ id: 10, ourId: 'CHC.IK.01' });
        repository.contract.mockResolvedValue({ id: 21, projectId: 10, projectOurId: 'CHC.IK.01', ourId: 'CHC.IK.02' });
        repository.reserve.mockImplementation(async (address: string, code: string, projectId: number | null, contractId: number | null, createdByPersonId: number | null) => {
            const row: MailboxRecord = { id: rows.length + 1, address, code, projectId, contractId, createdByPersonId, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'PENDING', lastError: null };
            rows.push(row);
            return row;
        });
        repository.setState.mockImplementation(async (id: number, statusCode: string, lastError: string | null) => {
            Object.assign(rows.find(row => row.id === id)!, { statusCode, lastError });
        });
        repository.setAgentCopyState.mockImplementation(async (id: number, agentCopyStatus: string, agentCopyLastError: string | null) => {
            Object.assign(rows.find(row => row.id === id)!, { agentCopyStatus, agentCopyLastError });
        });
        repository.moveToProject.mockImplementation(async (id: number, projectId: number) => {
            if (rows.some(row => row.projectId === projectId)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
            Object.assign(rows.find(row => row.id === id)!, { contractId: null, projectId });
        });
        repository.findWithAssignees.mockImplementation(async () => rows.map(row => ({
            code: row.code, address: row.address, managerId: 1, adminId: 2, selectedPersonId: 3,
        })));
        (ContractsController.createContractFromDto as jest.Mock).mockResolvedValue({ id: 21, projectOurId: 'CHC.IK.01', ourId: 'CHC.IK.02' });
        (ContractsController.addWithAuth as jest.Mock).mockImplementation(async contract => { savedContracts.push(contract.id); });
        (ProjectsController.addFromDto as jest.Mock).mockImplementation(async dto => {
            savedProjects.push(10); return { id: 10, ourId: dto.ourId };
        });
    });

    afterEach(() => {
        for (const id of Object.keys(TaskStore.items)) TaskStore.remove(id);
    });

    async function call(route: string, parsedBody: any = {}, personId = 1, params: any = {}, query: any = {}) {
        const request = { parsedBody, body: parsedBody, params, query, session: { userData: { enviId: personId } } };
        const response = { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn() };
        const next = jest.fn();
        await handlers[route](request, response, next);
        await background;
        background = undefined;
        return { response, next, body: response.send.mock.calls[0]?.[0] };
    }

    function publicTask(taskId: string) {
        const { timeout, ...task } = TaskStore.get(taskId)!;
        return task;
    }

    function assertNoSecretElsewhere(secrets: string[], ...otherResponses: unknown[]) {
        const observable = inspect({ logs: logs.map(log => log.mock.calls), reports: (ToolsMail.sendServerErrorReport as jest.Mock).mock.calls,
            tasks: Object.keys(TaskStore.items).map(publicTask), rows, otherResponses }, { depth: 20 });
        for (const secret of secrets) expect(observable).not.toContain(secret);
    }

    it('zapisuje kontrakt, rezerwuje PENDING przed serwerem, kończy ACTIVE; hasło tylko w odpowiedzi /password', async () => {
        (DirectAdminGateway.create as jest.Mock).mockImplementation(async () => {
            expect(savedContracts).toEqual([21]);
            expect(rows[0].statusCode).toBe('PENDING');
        });
        const registered = await call('post /contractReact', { _selectedPersonIds: [3, 3], _mailboxSelection: { mode: 'separate' } });
        expect(registered.response.status).toHaveBeenCalledWith(202);
        expect(registered.next).not.toHaveBeenCalled();
        expect(publicTask(registered.body.taskId)).toMatchObject({ status: 'done', result: { _mailbox: { statusCode: 'ACTIVE', lastError: null } } });
        expect((ContractsController.addWithAuth as jest.Mock).mock.calls[0][2].selectedPersonIds).toEqual([3]);
        expect(rows[0]).toMatchObject({ address: 'chc.ik.02@envi.com.pl', contractId: 21, projectId: null });
        const passwordResponse = await call('post /mailboxes/:id/password', {}, 3, { id: '1' });
        expect(passwordResponse.next).not.toHaveBeenCalled();
        expect(passwordResponse.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(passwordResponse.body.password).toMatch(/^[a-zA-Z0-9]{16,}$/);
        expect(DirectAdminGateway.changePassword).toHaveBeenCalledWith(rows[0].address, passwordResponse.body.password);
        const list = await call('get /mailboxes', {}, 1, {}, { contractId: '21' });
        const firstPoll = publicTask(registered.body.taskId);
        const secondPoll = publicTask(registered.body.taskId);
        expect(firstPoll).toEqual(secondPoll);
        assertNoSecretElsewhere([(DirectAdminGateway.create as jest.Mock).mock.calls[0][1], passwordResponse.body.password], registered.body, list.body, firstPoll, secondPoll);
    });

    it('odrzucenie serwera zostawia kontrakt i PENDING z komunikatem; ponowienie zakłada ACTIVE bez wycieku hasła', async () => {
        const message = 'Ten adres e-mail jest już zajęty na serwerze poczty';
        (DirectAdminGateway.create as jest.Mock).mockRejectedValueOnce(new Error(message));
        const registered = await call('post /contractReact');
        expect(savedContracts).toEqual([21]);
        expect(publicTask(registered.body.taskId)).toMatchObject({ status: 'done', result: { _mailbox: { agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'PENDING', lastError: message } } });
        const retry = await call('post /mailboxes/:id/provision', {}, 3, { id: '1' });
        expect(retry.next).not.toHaveBeenCalled();
        expect(retry.body).toMatchObject({ statusCode: 'ACTIVE', lastError: null });
        const list = await call('get /mailboxes', {}, 1, {}, { projectId: '10' });
        assertNoSecretElsewhere((DirectAdminGateway.create as jest.Mock).mock.calls.map(call => call[1]), registered.body, retry.body, list.body);
    });

    it('brak konfiguracji też zostawia PENDING i zapisany kontrakt', async () => {
        (DirectAdminGateway.create as jest.Mock).mockRejectedValueOnce(new Error('Serwer poczty nie jest skonfigurowany'));
        const registered = await call('post /contractReact');
        expect(savedContracts).toEqual([21]);
        expect(publicTask(registered.body.taskId)).toMatchObject({ status: 'done', result: { _mailbox: { lastError: 'Serwer poczty nie jest skonfigurowany', agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'PENDING' } } });
    });

    it('błąd DB po sukcesie serwera raportuje osieroconą skrzynkę z adresem, kontrakt pozostaje zapisany', async () => {
        repository.setState.mockRejectedValueOnce(new Error('DB unavailable'));
        const registered = await call('post /contractReact');
        expect(publicTask(registered.body.taskId).status).toBe('done');
        expect(savedContracts).toEqual([21]);
        expect(ToolsMail.sendServerErrorReport).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('chc.ik.01@envi.com.pl') }));
        expect(logs[2]).toHaveBeenCalledWith(expect.stringContaining('Osierocona skrzynka'));
        assertNoSecretElsewhere([(DirectAdminGateway.create as jest.Mock).mock.calls[0][1]], registered.body);
    });

    it('domyślnie korzysta z istniejącej skrzynki projektu bez ponownego zakładania', async () => {
        rows.push({ id: 1, code: 'chc-ik-01', address: mailboxAddress('CHC.IK.01'), projectId: 10, contractId: null, createdByPersonId: 77, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'ACTIVE' });
        const registered = await call('post /contractReact');
        expect(publicTask(registered.body.taskId)).toMatchObject({ status: 'done', result: { _mailboxCreated: false } });
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
        expect(repository.reserve).not.toHaveBeenCalled();
        expect(rows[0].createdByPersonId).toBe(77);
    });

    it.each([
        ['post /project', 'project'],
        ['post /contractReact', 'project'],
        ['post /contractReact', 'separate'],
    ])('%s (%s): zakładający bez przypisań dostaje hasło, inna osoba dostaje 403', async (route, mode) => {
        repository.findWithAssignees.mockResolvedValue([]);
        (SbAccessRepository as jest.Mock).mockImplementation(() => ({
            getPersonAccount: jest.fn().mockResolvedValue({ isActive: true }),
            getByPersonId: jest.fn().mockResolvedValue(undefined),
        }));
        const registered = await call(route, {
            ourId: 'CHC.IK.01', _mailboxSelection: { mode }, createdByPersonId: 99,
        }, 77);
        expect(registered.next).not.toHaveBeenCalled();
        expect(rows[0].createdByPersonId).toBe(77);
        expect(repository.reserve).toHaveBeenCalledWith(rows[0].address, rows[0].code, rows[0].projectId, rows[0].contractId, 77);
        const password = await call('post /mailboxes/:id/password', {}, 77, { id: '1' });
        expect(password.next).not.toHaveBeenCalled();
        expect(password.body.password).toMatch(/^[a-zA-Z0-9]{16,}$/);
        const denied = await call('post /mailboxes/:id/password', {}, 99, { id: '1' });
        expect(denied.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
        expect(denied.body).toBeUndefined();
        expect(DirectAdminGateway.changePassword).toHaveBeenCalledTimes(1);
        assertNoSecretElsewhere([password.body.password], registered.body, denied.body);
    });

    it('odczyt surowego wyboru osób zachowuje tablicę jednoelementową tracącą kształt w parsedBody', async () => {
        const body = { _selectedPersonIds: [7] };
        const parsedBody = Tools.parseObjectsJSON(body);
        expect(parsedBody._selectedPersonIds).toBe(7);
        const response = { status: jest.fn().mockReturnThis(), send: jest.fn() };
        const next = jest.fn();
        await handlers['post /contractReact']({ body, parsedBody, session: { userData: { enviId: 1 } } }, response, next);
        await background;
        expect(next).not.toHaveBeenCalled();
        expect((ContractsController.addWithAuth as jest.Mock).mock.calls[0][2].selectedPersonIds).toEqual([7]);
    });

    it('rejestracja projektu tworzy jego skrzynkę; wybór bez skrzynki odrzuca przed zapisem', async () => {
        const result = await call('post /project', { ourId: 'CHC.IK.01' });
        expect(result.body).toMatchObject({ id: 10, _mailbox: { projectId: 10, statusCode: 'ACTIVE' } });
        expect(savedProjects).toEqual([10]);
        jest.clearAllMocks();
        const skipped = await call('post /project', { ourId: 'ALT.IK.01', _mailboxSelection: { mode: 'none' } });
        expect(skipped.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringContaining('musi mieć skrzynkę') }));
        expect(ProjectsController.addFromDto).not.toHaveBeenCalled();
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
    });

    it('kontrakt nadal można utworzyć bez skrzynki', async () => {
        const result = await call('post /contractReact', { _mailboxSelection: { mode: 'none' } });
        expect(result.next).not.toHaveBeenCalled();
        expect(savedContracts).toEqual([21]);
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
    });

    it.each(['password', 'provision', 'project', 'agentCopy'])('nieaktywny zakładający nie może wykonać %s', async action => {
        rows.push({ id: 1, code: 'assigned', address: 'assigned@envi.com.pl', projectId: 10, contractId: null,
            createdByPersonId: 77, statusCode: 'ACTIVE', agentCopyStatus: 'PENDING', agentCopyLastError: null });
        (SbAccessRepository as jest.Mock).mockImplementation(() => ({
            getPersonAccount: jest.fn().mockResolvedValue({ isActive: false }),
        }));
        const denied = await call(`post /mailboxes/:id/${action}`, {}, 77, { id: '1' });
        expect(denied.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
        expect(DirectAdminGateway.changePassword).not.toHaveBeenCalled();
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
        expect(DirectAdminGateway.setAgentCopy).not.toHaveBeenCalled();
    });

    it.each<[(number[] | undefined)]>([[[7]], [[]], [undefined]])('edycja przekazuje surową listę %j, także pojedynczą osobę', async ids => {
        const body = { id: 21, ...(ids === undefined ? {} : { _selectedPersonIds: ids }) };
        const response = { send: jest.fn() };
        const next = jest.fn();
        await handlers['put /contract/:id']({ body, parsedBody: Tools.parseObjectsJSON(body), params: { id: '21' } }, response, next);
        expect(next).not.toHaveBeenCalled();
        expect(ContractsController.editWithAuth).toHaveBeenCalledWith(expect.objectContaining({ id: 21 }), undefined, ids);
    });

    it.each<[unknown]>([[null], [[0]], [[1.5]], ['7'], [Array(51).fill(7)]])('edycja odrzuca błędną listę %j przed zapisem', async ids => {
        const result = await call('put /contract/:id', { _selectedPersonIds: ids }, 1, { id: '21' });
        expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(ContractsController.editWithAuth).not.toHaveBeenCalled();
    });

    it('odczyt osób używa tego samego zakresu co odczyt kontraktu i nie ujawnia osób spoza niego', async () => {
        const scope = { projectOurIds: ['CHC.IK.01'] };
        (ContractsController.find as jest.Mock).mockResolvedValueOnce([]);
        const find = jest.spyOn(ContractSelectedPersonsRepository, 'find').mockResolvedValue([{ id: 3, name: 'Anna' }] as any);
        const response = { send: jest.fn() };
        const next = jest.fn();
        const req = { params: { id: '21' }, projectScope: scope };
        await handlers['get /contract/:id/selectedPersons'](req, response, next);
        expect(ContractsController.find).toHaveBeenCalledWith([{ id: 21 }], scope);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
        expect(find).not.toHaveBeenCalled();
        (ContractsController.find as jest.Mock).mockResolvedValueOnce([{ id: 21 }]);
        await handlers['get /contract/:id/selectedPersons'](req, response, jest.fn());
        expect(find).toHaveBeenCalledWith(21);
        expect(response.send).toHaveBeenCalledWith([{ id: 3, name: 'Anna' }]);
    });

    it('umowa zewnętrzna bez oznaczenia ENVI wymaga adresu osobnej skrzynki przed rejestracją', async () => {
        (ContractsController.createContractFromDto as jest.Mock).mockResolvedValueOnce({ projectOurId: 'CHC.IK.01' });
        const rejected = await call('post /contractReact', { _mailboxSelection: { mode: 'separate' } });
        expect(rejected.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringContaining('Wpisz adres') }));
        expect(ContractsController.addWithAuth).not.toHaveBeenCalled();
        expect(TaskStore.items).toEqual({});
    });

    it('błędne osoby odrzuca także bez pokoju Chat, przed rejestracją', async () => {
        for (const ids of [[0], [1.5], '7', Array(51).fill(7)]) {
            const rejected = await call('post /contractReact', { _selectedPersonIds: ids });
            expect(rejected.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        }
        expect(ContractsController.addWithAuth).not.toHaveBeenCalled();
    });

    it.each(['post /project', 'post /contractReact'])('%s: błędny i zajęty adres odrzuca przed zapisem domenowym', async route => {
        for (const address of ['Żółć@envi.com.pl', 'valid@other.example']) {
            const rejected = await call(route, { ourId: 'CHC.IK.01', _mailboxSelection: { mode: route.endsWith('project') ? 'project' : 'separate', address } });
            expect(rejected.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        }
        repository.addressExists.mockResolvedValueOnce(true);
        const duplicate = await call(route, { ourId: 'CHC.IK.01', _mailboxSelection: { mode: route.endsWith('project') ? 'project' : 'separate', address: 'used@envi.com.pl' } });
        expect(duplicate.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(ProjectsController.addFromDto).not.toHaveBeenCalled();
        expect(ContractsController.addWithAuth).not.toHaveBeenCalled();
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
    });

    it.each([1, 2, 3, 9])('osoba %s z reguły ma prawo ponowić skrzynkę PENDING', async personId => {
        rows.push({ id: 1, code: personId === 9 ? 'manual' : 'assigned', address: 'assigned@envi.com.pl', projectId: 10, contractId: null, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'PENDING' });
        const result = await call('post /mailboxes/:id/provision', {}, personId, { id: '1' });
        expect(result.next).not.toHaveBeenCalled();
        expect(result.body.statusCode).toBe('ACTIVE');
        expect(repository.findWithAssignees).toHaveBeenCalledWith(true);
    });

    it('osoba obca, w tym przypisana zewnętrznie w PersonProjects, nie może zarządzać skrzynką', async () => {
        rows.push({ id: 1, code: 'assigned', address: 'assigned@envi.com.pl', projectId: 10, contractId: null, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'ACTIVE' });
        for (const action of ['password', 'provision', 'project', 'agentCopy']) {
            const result = await call(`post /mailboxes/:id/${action}`, {}, 99, { id: '1' });
            expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
        }
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
        expect(DirectAdminGateway.changePassword).not.toHaveBeenCalled();
    });

    it('zarządzający Dostępami SB ma dostęp niezależnie od przypisania', async () => {
        rows.push({ id: 1, code: 'assigned', address: 'assigned@envi.com.pl', projectId: 10, contractId: null, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'ACTIVE' });
        (SbAccessController.canManage as jest.Mock).mockResolvedValue(true);
        const result = await call('post /mailboxes/:id/password', {}, 99, { id: '1' });
        expect(result.next).not.toHaveBeenCalled();
        expect(result.body.password).toMatch(/^[a-zA-Z0-9]{16,}$/);
    });

    it('zmiana hasła odrzucona przez pocztę nie ujawnia nowego hasła w innych odpowiedziach ani logach', async () => {
        rows.push({ id: 1, code: 'assigned', address: 'assigned@envi.com.pl', projectId: 10, contractId: null, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'ACTIVE' });
        (DirectAdminGateway.changePassword as jest.Mock).mockRejectedValueOnce(new Error('Serwer poczty odrzucił operację. Skontaktuj się z administratorem'));
        const rejected = await call('post /mailboxes/:id/password', {}, 3, { id: '1' });
        expect(rejected.body).toBeUndefined();
        expect(rejected.next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Serwer poczty odrzucił') }));
        const list = await call('get /mailboxes', {}, 1, {}, { projectId: '10' });
        assertNoSecretElsewhere([(DirectAdminGateway.changePassword as jest.Mock).mock.calls[0][1]], list.body, rejected.next.mock.calls);
    });

    it('przepięcie kontrakt → projekt zachowuje adres i nie woła poczty; drugi adres projektu daje 409', async () => {
        rows.push({ id: 1, code: 'contract', address: 'contract@envi.com.pl', projectId: null, contractId: 21, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'ACTIVE' });
        const moved = await call('post /mailboxes/:id/project', {}, 1, { id: '1' });
        expect(moved.body).toMatchObject({ address: 'contract@envi.com.pl', projectId: 10, contractId: null });
        rows.push({ id: 2, code: 'other', address: 'other@envi.com.pl', projectId: null, contractId: 22, agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'ACTIVE' });
        const conflict = await call('post /mailboxes/:id/project', {}, 1, { id: '2' });
        expect(conflict.next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
        expect(DirectAdminGateway.create).not.toHaveBeenCalled();
        expect(DirectAdminGateway.changePassword).not.toHaveBeenCalled();
    });

    it('repozytorium osób zapisuje wybór przy kontrakcie w przekazanej transakcji', async () => {
        const connection = {} as any;
        await ContractSelectedPersonsRepository.add(21, [3, 4], connection);
        expect(ToolsDb.executeSQL).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO ContractSelectedPersons'), [21, 3], connection);
        expect(ToolsDb.executeSQL).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO ContractSelectedPersons'), [21, 4], connection);
        const persons = [{ id: 3, name: 'Anna', surname: 'Kowalska', email: 'anna@example.test' }];
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValueOnce(persons);
        expect(await ContractSelectedPersonsRepository.find(21)).toEqual(persons);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE sp.ContractId = ?'), undefined, [21]);
    });

    it('rzeczywisty odczyt przypisań zawiera wybrane osoby, a nie role zewnętrzne PersonProjects', async () => {
        const ActualRepository = jest.requireActual('../MailboxRepository').default;
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([]);
        await new ActualRepository().findWithAssignees(true);
        const sql = (ToolsDb.getQueryCallbackAsync as jest.Mock).mock.calls[0][0];
        expect(sql).toContain('ContractSelectedPersons');
        expect(sql).not.toContain('PersonProjects');
        expect(sql).not.toContain('CreatedByPersonId');
        expect(sql).toContain("'PENDING'");
    });

    it('repozytorium zapisuje zakładającego przy rezerwacji i odczytuje go z bazy', async () => {
        const ActualRepository = jest.requireActual('../MailboxRepository').default;
        const actual = new ActualRepository();
        (ToolsDb.executeSQL as jest.Mock).mockResolvedValue({ insertId: 1 });
        const mailbox = await actual.reserve('new@envi.com.pl', 'new', 10, null, 77);
        expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining('CreatedByPersonId'), ['new', 'new@envi.com.pl', 10, null, 77]);
        expect(mailbox.createdByPersonId).toBe(77);
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([mailbox]);
        expect(await actual.get(1)).toEqual(mailbox);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining('CreatedByPersonId AS createdByPersonId'), undefined, [1]);
    });
    it('MBX-4: rejestracja i ponowienie z prawdziwą bramą/fetch: błąd kopii zostawia ACTIVE/PENDING, ponowienie daje SET', async () => {
        const before = { ...process.env };
        try {
            process.env.DIRECTADMIN_URL = 'https://mail.example.test';
            process.env.DIRECTADMIN_LOGIN_USER = 'test';
            process.env.DIRECTADMIN_LOGIN_KEY = 'key';
            process.env.DIRECTADMIN_AGENT_COPY_ADDRESS = 'sb-agent@envi.com.pl';
            process.env.DIRECTADMIN_MAILBOX_QUOTA_MB = '2048';
            const actual = jest.requireActual('../directAdminGateway').default;
            (DirectAdminGateway.create as jest.Mock).mockImplementation((...args) => actual.create(...args));
            (DirectAdminGateway.changePassword as jest.Mock).mockImplementation((...args) => actual.changePassword(...args));
            (DirectAdminGateway.setAgentCopy as jest.Mock).mockImplementation((...args) => actual.setAgentCopy(...args));
            let failCopy = true;
            const generatedPasswords: string[] = [];
            const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
                const body = new URLSearchParams(options?.body as string);
                const pop = String(url).endsWith('/CMD_API_POP');
                if (pop) generatedPasswords.push(body.get('passwd')!);
                const response = pop ? 'error=0' : body.get('action') === 'list' ? '' : failCopy
                    ? new URLSearchParams({ error: '1', details: generatedPasswords[0] }).toString() : 'error=0';
                return { ok: true, text: async () => response } as Response;
            });
            const registered = await call('post /project', { ourId: 'CHC.IK.01' });
            expect(registered.body._mailbox).toMatchObject({ statusCode: 'ACTIVE', agentCopyStatus: 'PENDING',
                agentCopyLastError: 'Serwer poczty odrzucił operację. Skontaktuj się z administratorem' });
            expect(rows[0]).toMatchObject(registered.body._mailbox);
            const password = await call('post /mailboxes/:id/password', {}, 1, { id: '1' });
            expect(password.body.password).toBe(generatedPasswords[1]);
            failCopy = false;
            const retried = await call('post /mailboxes/:id/agentCopy', {}, 1, { id: '1' });
            expect(retried.next).not.toHaveBeenCalled();
            expect(retried.body).toMatchObject({ statusCode: 'ACTIVE', agentCopyStatus: 'SET', agentCopyLastError: null });
            const count = fetchMock.mock.calls.length;
            await call('post /mailboxes/:id/agentCopy', {}, 1, { id: '1' });
            expect(fetchMock).toHaveBeenCalledTimes(count);
            const list = await call('get /mailboxes', {}, 1, {}, { projectId: '10' });
            const sbList = await MailboxController.list(10);
            assertNoSecretElsewhere(generatedPasswords, registered.body, retried.body, list.body, sbList);

            // Ta sama ścieżka po ponowieniu zakładania skrzynki z MBX-3.
            Object.assign(rows[0], { statusCode: 'PENDING', agentCopyStatus: 'PENDING' });
            failCopy = true;
            const provision = await call('post /mailboxes/:id/provision', {}, 1, { id: '1' });
            expect(provision.body).toMatchObject({ statusCode: 'ACTIVE', agentCopyStatus: 'PENDING' });
            assertNoSecretElsewhere(generatedPasswords, provision.body);
        } finally { process.env = before; }
    });

    it.each([
        ['timeout', 'list[]=chc.ik.01', true, 'Nie zakładaj jej ponownie'],
        ['timeout', 'list[]=inne-konto', false, 'Możesz ponowić próbę'],
        ['timeout', null, true, 'Sprawdź ją ręcznie'],
        ['timeout', '<html>awaria</html>', true, 'Sprawdź ją ręcznie'],
        ['http', 'list[]=chc.ik.01', true, 'Nie zakładaj jej ponownie'],
        ['unreadable', 'list[]=chc.ik.01', true, 'Nie zakładaj jej ponownie'],
        ['taken', null, true, 'adres e-mail jest już zajęty'],
    ])('wynik create=%s, lista=%s: zostawia PENDING, uzgadnia wynik i raportuje gdy trzeba', async (failure, listing, reports, message) => {
        const before = { ...process.env };
        try {
            process.env.DIRECTADMIN_URL = 'https://mail.example.test';
            process.env.DIRECTADMIN_LOGIN_USER = 'test';
            process.env.DIRECTADMIN_LOGIN_KEY = 'key';
            process.env.DIRECTADMIN_MAILBOX_QUOTA_MB = '10';
            const actual = jest.requireActual('../directAdminGateway').default;
            (DirectAdminGateway.create as jest.Mock).mockImplementation((...args) => actual.create(...args));
            (DirectAdminGateway.accountExists as jest.Mock).mockImplementation((...args) => actual.accountExists(...args));
            const passwords: string[] = [];
            const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
                expect(String(url)).toBe('https://mail.example.test/CMD_API_POP');
                const body = new URLSearchParams(options?.body as string);
                expect(body.get('domain')).toBe('envi.com.pl');
                if (body.get('action') === 'list') {
                    expect(body.has('passwd')).toBe(false);
                    if (listing === null) throw new Error('list timeout');
                    return { ok: true, text: async () => listing } as Response;
                }
                passwords.push(body.get('passwd')!);
                if (failure === 'timeout') throw new Error(`timeout ${passwords[0]}`);
                return { ok: failure !== 'http', text: async () => failure === 'taken'
                    ? new URLSearchParams({ error: '1', details: `Email account already exists ${passwords[0]}` }).toString()
                    : `<html>${passwords[0]}</html>` } as Response;
            });
            const result = await call('post /project', { ourId: 'CHC.IK.01' });
            expect(result.next).not.toHaveBeenCalled();
            expect(result.body._mailbox).toMatchObject({ statusCode: 'PENDING', lastError: expect.stringContaining(message) });
            expect(rows[0].statusCode).toBe('PENDING');
            expect(DirectAdminGateway.setAgentCopy).not.toHaveBeenCalled();
            expect(fetchMock).toHaveBeenCalledTimes(failure === 'taken' ? 1 : 2);
            expect(ToolsMail.sendServerErrorReport).toHaveBeenCalledTimes(reports ? 1 : 0);
            if (reports) expect(ToolsMail.sendServerErrorReport).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('chc.ik.01@envi.com.pl') }));
            assertNoSecretElsewhere(passwords, result.body);
        } finally { process.env = before; }
    });

    it('kopia wymaga ACTIVE; nie wywołuje serwera dla PENDING', async () => {
        rows.push({ id: 1, code: 'assigned', address: 'assigned@envi.com.pl', projectId: 10, contractId: null,
            agentCopyStatus: 'PENDING', agentCopyLastError: null, statusCode: 'PENDING' });
        const rejected = await call('post /mailboxes/:id/agentCopy', {}, 1, { id: '1' });
        expect(rejected.next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
        expect(DirectAdminGateway.setAgentCopy).not.toHaveBeenCalled();
    });

    it.each(['sb-agent@envi.com.pl', 'sb.agent@envi.com.pl', 'technical@envi.com.pl'])('adres konta technicznego %s jest zarezerwowany przed zapisem i siecią', async address => {
        const before = process.env.DIRECTADMIN_AGENT_COPY_ADDRESS;
        process.env.DIRECTADMIN_AGENT_COPY_ADDRESS = 'technical@envi.com.pl';
        try {
            const result = await call('post /project', { ourId: 'CHC.IK.01', _mailboxSelection: { mode: 'project', address } });
            expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringContaining('zarezerwowany') }));
            expect(ProjectsController.addFromDto).not.toHaveBeenCalled();
            expect(DirectAdminGateway.create).not.toHaveBeenCalled();
        } finally {
            if (before === undefined) delete process.env.DIRECTADMIN_AGENT_COPY_ADDRESS;
            else process.env.DIRECTADMIN_AGENT_COPY_ADDRESS = before;
        }
    });

});
