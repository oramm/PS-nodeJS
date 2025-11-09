import express, { Request, Response } from 'express';
import MilestoneTypesController from './MilestoneTypesController';
import { app } from '../../../index';
import MilestoneType from './MilestoneType';
import PersonsController from '../../../persons/PersonsController';

app.post('/milestoneTypes', async (req: Request, res: Response, next) => {
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

app.post('/milestoneType', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new MilestoneType({ ...req.parsedBody, _editor });
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/milestoneType/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new MilestoneType({ ...req.parsedBody, _editor });
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/milestoneType/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new MilestoneType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
