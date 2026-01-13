import DocumentTemplatesController from './DocumentTemplatesController';
import { app } from '../index';
import { Request, Response } from 'express';

app.post('/documentTemplates', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await DocumentTemplatesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/documentTemplate', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const item = await DocumentTemplatesController.addNewTemplate(
            req.parsedBody,
            req.session.userData
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/documentTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await DocumentTemplatesController.updateTemplate(
            req.parsedBody,
            req.session.userData,
            fieldsToUpdate
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete(
    '/documentTemplate/:id',
    async (req: Request, res: Response, next) => {
        try {
            const result = await DocumentTemplatesController.deleteTemplate(
                req.body
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);
