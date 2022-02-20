import express from 'express'
import CaseType from './CaseType';
import CaseTypesController from './CaseTypesController';
import { app } from '../../../../index';

app.get('/caseTypes', async (req: any, res: any) => {
    try {
        var result = await CaseTypesController.getCaseTypesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }


});

app.get('/caseType/:id', async (req: any, res: any) => {
    try {
        var result = await CaseTypesController.getCaseTypesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.post('/caseType', async (req: any, res: any) => {
    try {
        let item = new CaseType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/caseType/:id', async (req: any, res: any) => {
    try {
        let item = new CaseType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/caseType/:id', async (req: any, res: any) => {
    try {
        let item = new CaseType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});