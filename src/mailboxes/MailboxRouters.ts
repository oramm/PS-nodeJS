import { app } from '../index';
import MailboxController, { MailboxError, mailboxAddress, validateMailboxAddress } from './MailboxController';

function id(value: unknown): number {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new MailboxError('Nieprawidłowy numer skrzynki, projektu lub kontraktu.', 400);
    return Number(value);
}

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
        res.send({ mailboxes: await MailboxController.list(
            req.query.projectId === undefined ? undefined : id(req.query.projectId),
            req.query.contractId === undefined ? undefined : id(req.query.contractId),
        ) });
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
