import CaseTemplatesController from './CaseTemplatesController';
import { app } from '../../../../index';
import CaseTemplate from './CaseTemplate';
import { Request, Response } from 'express';

/**
 * Router dla CaseTemplates - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 */

app.get('/caseTemplates', async (req: Request, res: Response, next) => {
    try {
        const result = await CaseTemplatesController.find(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error) res.status(500).send(err.message);
    }
});

app.get('/caseTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await CaseTemplatesController.find(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/caseTemplate', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = new CaseTemplate(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        const result = await CaseTemplatesController.add(
            item,
            req.session.userData // userData - Controller ustawi _editor
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/caseTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = new CaseTemplate(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        const result = await CaseTemplatesController.edit(
            item,
            req.session.userData // userData - Controller ustawi _editor
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/caseTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new CaseTemplate(req.body);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        await CaseTemplatesController.delete(item);

        res.send(item);
    } catch (error) {
        next(error);
    }
});
