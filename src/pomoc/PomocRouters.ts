import { Express } from 'express';
import { randomUUID } from 'crypto';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import { app } from '../index';
import { askPomoc, pomocAccess, pomocDefaults, PomocDependencies, pomocIdentity } from './service';
import { parsePomocInput } from './input';
import { pomocDataTools } from './data-tools';

export function registerPomocRoutes(server: Express, deps: PomocDependencies = pomocDefaults) {
    server.get('/pomoc/available', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const access = await pomocAccess(req, deps);
        res.send({ available: !!access, ...(access ? { version: access.version } : {}) });
    });
    server.post('/pomoc/ask', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!pomocIdentity(req, deps.env)) {
            res.status(403).send({ errorMessage: 'Brak dostępu do Pomocy.' });
            return;
        }
        // JSON wymusza preflight CORS; formularz z obcej strony nie uruchomi płatnego modelu.
        if (!req.is('application/json')) {
            res.status(415).send({ errorMessage: 'Pomoc przyjmuje wyłącznie JSON.' });
            return;
        }
        let input;
        try { input = parsePomocInput(req.body); }
        catch {
            res.status(400).send({ errorMessage: 'Nieprawidłowe pytanie lub kontekst Pomocy.' });
            return;
        }
        const tools = pomocDataTools(req);
        const taskId = randomUUID();
        TaskStore.create(taskId);
        TaskStore.get(taskId)!.pomocOwnerId = req.session.userData!.enviId;
        res.status(202).send({ taskId, status: 'processing', progressMessage: 'Pomoc szuka odpowiedzi', percent: 0 });
        void askPomoc(req, input, tools, deps).then(
            (result) => TaskStore.complete(taskId, result, 'Pomoc przygotowała odpowiedź'),
            () => TaskStore.fail(taskId, 'Nie udało się uzyskać odpowiedzi Pomocy.'),
        );
    });
}

registerPomocRoutes(app);
