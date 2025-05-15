import express from 'express';
import CaseType from './CaseType';
import CaseTypesController from './CaseTypesController';
import { app } from '../../../../index';

app.post('/caseTypes', async (req: any, res: any, next) => {
    try {
        const orCondition = req.parsedBody.orCondition;
        const result = await CaseTypesController.getCaseTypesList(orCondition);
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error) res.status(500).send(err.message);
    }
});

app.post('/caseType', async (req: any, res: any, next) => {
    try {
        let item = new CaseType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/caseType/:id', async (req: any, res: any, next) => {
    try {
        let item = new CaseType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/caseType/:id', async (req: any, res: any, next) => {
    try {
        let item = new CaseType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
