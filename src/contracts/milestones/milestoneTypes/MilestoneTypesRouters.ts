import express from 'express';
import MilestoneTypesController from './MilestoneTypesController';
import { app } from '../../../index';
import MilestoneType from './MilestoneType';

app.post('/milestoneTypes', async (req: any, res: any, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await MilestoneTypesController.getMilestoneTypesList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestoneType', async (req: any, res: any, next) => {
    try {
        let item = new MilestoneType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/milestoneType/:id', async (req: any, res: any, next) => {
    try {
        let item = new MilestoneType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/milestoneType/:id', async (req: any, res: any, next) => {
    try {
        let item = new MilestoneType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
