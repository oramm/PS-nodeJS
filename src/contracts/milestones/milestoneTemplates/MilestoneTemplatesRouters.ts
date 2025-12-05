import MilestoneTemplatesController from './MilestoneTemplatesController';
import { app } from '../../../index';
import MilestoneTemplate from './MilestoneTemplate';
import { Request, Response } from 'express';

/**
 * Router dla MilestoneTemplates - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE tworzy instancji Model (z wyjątkiem mapowania req.body)
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 */

app.post('/milestoneTemplates', async (req: Request, res: Response, next) => {
    try {
        const result = await MilestoneTemplatesController.find(
            req.parsedBody,
            req.parsedBody.templateType
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestoneTemplate', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = new MilestoneTemplate(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        const result = await MilestoneTemplatesController.add(
            item,
            undefined, // auth - nie potrzebny dla MilestoneTemplate
            req.session.userData // userData - Controller ustawi _editor
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/milestoneTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = new MilestoneTemplate(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
        const result = await MilestoneTemplatesController.edit(
            item,
            undefined, // auth - nie potrzebny dla MilestoneTemplate
            req.session.userData // userData - Controller ustawi _editor
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete(
    '/milestoneTemplate/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = new MilestoneTemplate(req.body);

            // ✅ Bezpośrednie wywołanie Controller - zgodnie z Clean Architecture
            await MilestoneTemplatesController.delete(item);

            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);
