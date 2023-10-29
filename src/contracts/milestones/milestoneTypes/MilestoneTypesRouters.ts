import express from 'express'
import MilestoneTypesController from './MilestoneTypesController'
import { app } from '../../../index';
import MilestoneType from './MilestoneType';

app.post('/milestoneTypes', async (req: any, res: any) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await MilestoneTypesController.getMilestoneTypesList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/milestoneType', async (req: any, res: any) => {
    try {
        let item = new MilestoneType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/milestoneType/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/milestoneType/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});