import express, { Request, Response } from 'express';
import CaseType from './CaseType';
import CaseTypesController from './CaseTypesController';
import { app } from '../../../../index';
import PersonsController from '../../../../persons/PersonsController';

app.post('/caseTypes', async (req: Request, res: Response, next) => {
    try {
        const orCondition = req.parsedBody.orCondition;
        const result = await CaseTypesController.getCaseTypesList(orCondition);
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error) res.status(500).send(err.message);
    }
});

app.post('/caseType', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new CaseType({ ...req.parsedBody, _editor });
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/caseType/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new CaseType({ ...req.parsedBody, _editor });
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/caseType/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new CaseType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
