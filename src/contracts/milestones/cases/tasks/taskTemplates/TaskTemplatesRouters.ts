import TaskTemplatesController from './TaskTemplatesController';
import { app } from '../../../../../index';
import TaskTemplate from './TaskTemplate';
import { Request, Response } from 'express';

/**
 * Router dla TaskTemplates - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 */

app.get('/taskTemplates', async (req: Request, res: Response, next) => {
    try {
        const result = await TaskTemplatesController.find(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/taskTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await TaskTemplatesController.find(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/taskTemplate', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = new TaskTemplate(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        const result = await TaskTemplatesController.add(
            item,
            req.session.userData // userData - Controller ustawi _editor
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/taskTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = new TaskTemplate(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        const result = await TaskTemplatesController.edit(
            item,
            req.session.userData // userData - Controller ustawi _editor
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/taskTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new TaskTemplate(req.body);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        await TaskTemplatesController.delete(item);

        res.send(item);
    } catch (error) {
        next(error);
    }
});
