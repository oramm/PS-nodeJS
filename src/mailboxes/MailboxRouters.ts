import { app } from '../index';
import MailboxController, { MailboxError, mailboxAddress, validateMailboxAddress } from './MailboxController';
import ProjectScopeGuard from '../persons/projectAssignments/ProjectScopeGuard';
import SbAccessController from '../sbAccess/SbAccessController';
import MailboxPasswordService from './MailboxPasswordService';

function id(value: unknown): number {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new MailboxError('Nieprawidłowy numer skrzynki, projektu lub kontraktu.', 400);
    return Number(value);
}

async function assertManager(req: any): Promise<void> {
    if (!(await SbAccessController.canManage(req.session?.userData)))
        throw new MailboxError('Skrzynkami ogólnofirmowymi zarządza administrator Dostępów SB.', 403);
}

app.post('/mailboxes/general', async (req, res, next) => {
    try {
        await assertManager(req);
        res.send(await MailboxController.addGeneral(req.parsedBody?.address, req.session?.userData?.enviId ?? null));
    } catch (error) { next(error); }
});

app.put('/mailboxes/:id/allEmployees', async (req, res, next) => {
    try {
        const mailboxId = id(req.params.id);
        await assertManager(req);
        res.send(await MailboxController.setAllEmployees(mailboxId, req.parsedBody?.allEmployees));
    } catch (error) { next(error); }
});

/** Partia zmian haseł; wywołujący powtarza z `afterId` z odpowiedzi, aż `remaining` = 0. */
app.post('/mailboxes/passwords/rotateAll', async (req, res, next) => {
    try {
        await assertManager(req);
        const afterId = req.parsedBody?.afterId;
        if (afterId !== undefined && (!Number.isSafeInteger(afterId) || afterId < 0))
            throw new MailboxError('Nieprawidłowy numer skrzynki, od której kontynuować.', 400);
        res.send(await MailboxPasswordService.rotateAll(afterId));
    } catch (error) { next(error); }
});

/** SKO-4: PS przejmuje hasło skrzynki (od teraz sam je wydaje komputerom); hasła nie ma w odpowiedzi. */
app.post('/mailboxes/:id/takeOver', async (req, res, next) => {
    try {
        const mailboxId = id(req.params.id);
        await assertManager(req);
        res.send(await MailboxPasswordService.takeOver(mailboxId));
    } catch (error) { next(error); }
});

app.get('/mailboxes/suggestion', (req, res, next) => {
    try {
        if (typeof req.query.code !== 'string') throw new MailboxError('Podaj oznaczenie projektu lub kontraktu.', 400);
        const address = mailboxAddress(req.query.code);
        validateMailboxAddress(address);
        res.send({ address });
    } catch (error) { next(error); }
});

app.get('/mailboxes', async (req, res, next) => {
    try {
        if ((req.query.projectId === undefined) === (req.query.contractId === undefined))
            throw new MailboxError('Wskaż projekt albo kontrakt.', 400);
        const projectId = req.query.projectId === undefined ? undefined : id(req.query.projectId);
        const contractId = req.query.contractId === undefined ? undefined : id(req.query.contractId);
        // Współpracownik (rola zakresowa z pocztą) widzi tylko przypisane projekty i tylko swoje skrzynki.
        if (contractId) await ProjectScopeGuard.assertContractInScope(contractId, req.projectScope);
        else await ProjectScopeGuard.assertProjectInScope(projectId, req.projectScope);
        res.send({ mailboxes: await MailboxController.list(projectId, contractId, req.session?.userData) });
    } catch (error) { next(error); }
});

app.post('/mailboxes/:id/provision', async (req, res, next) => {
    try {
        const mailboxId = id(req.params.id);
        await MailboxController.assertAccess(mailboxId, req.session?.userData);
        res.send(await MailboxController.provision(mailboxId));
    } catch (error) { next(error); }
});

app.post('/mailboxes/:id/password', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const mailboxId = id(req.params.id);
        await MailboxController.assertAccess(mailboxId, req.session?.userData);
        res.send(await MailboxController.password(mailboxId));
    } catch (error) { next(error); }
});

app.post('/mailboxes/:id/agentCopy', async (req, res, next) => {
    try {
        const mailboxId = id(req.params.id);
        await MailboxController.assertAccess(mailboxId, req.session?.userData);
        res.send(await MailboxController.agentCopy(mailboxId));
    } catch (error) { next(error); }
});

app.post('/mailboxes/:id/project', async (req, res, next) => {
    try {
        const mailboxId = id(req.params.id);
        await MailboxController.assertAccess(mailboxId, req.session?.userData);
        res.send(await MailboxController.moveToProject(mailboxId));
    } catch (error) { next(error); }
});
