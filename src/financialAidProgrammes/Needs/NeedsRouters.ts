import { Request, Response } from 'express';
import NeedsController from './NeedsController';
import { app } from '../../index';

app.post('/needs', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await NeedsController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);}
    });

app.post('/need', async (req: Request, res: Response, next) => {
    try {
        const item = await NeedsController.addNewNeed(req.body);
        res.send(item);
    } catch (error) {
        next(error);
        }
    });

app.put('/need/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody.fieldsToUpdate;  
        const item = await NeedsController.updateNeed(req.body, fieldsToUpdate);
        res.send(item);  
    } catch (error) {
        console.error(error);
            next(error);}
    });

app.delete('/need/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await NeedsController.deleteNeed(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
