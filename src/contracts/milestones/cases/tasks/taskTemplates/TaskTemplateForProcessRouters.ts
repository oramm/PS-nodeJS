import TasksTemplatesForProcessesController from './TasksTemplatesForProcessesController';
import { app } from '../../../../../index';
import TaskTemplateForProcess from './TaskTemplateForProcess';
import { Request, Response } from 'express';

/**
 * Router dla TaskTemplatesForProcesses - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 */

app.get(
    '/tasksTemplatesForProcesses',
    async (req: Request, res: Response, next) => {
        try {
            const result = await TasksTemplatesForProcessesController.find(
                req.query
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    '/tasksTemplateForProcess/:id',
    async (req: Request, res: Response, next) => {
        try {
            const result = await TasksTemplatesForProcessesController.find(
                req.params
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/tasksTemplateForProcess',
    async (req: Request, res: Response, next) => {
        try {
            if (!req.session.userData) {
                throw new Error('Not authenticated');
            }
            const item = new TaskTemplateForProcess(req.parsedBody);

            // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
            const result = await TasksTemplatesForProcessesController.add(
                item,
                req.session.userData // userData - Controller ustawi _editor
            );

            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/tasksTemplateForProcess/:id',
    async (req: Request, res: Response, next) => {
        try {
            if (!req.session.userData) {
                throw new Error('Not authenticated');
            }
            const item = new TaskTemplateForProcess(req.parsedBody);

            // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
            const result = await TasksTemplatesForProcessesController.edit(
                item,
                req.session.userData // userData - Controller ustawi _editor
            );

            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    '/tasksTemplateForProcess/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = new TaskTemplateForProcess(req.body);

            // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
            await TasksTemplatesForProcessesController.delete(item);

            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);
