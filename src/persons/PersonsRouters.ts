import PersonsController from './PersonsController';
import { app } from '../index';
import { Request, Response } from 'express';

app.post('/persons', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await PersonsController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/person', async (req: Request, res: Response, next) => {
    try {
        const item = await PersonsController.addFromDto(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/person/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await PersonsController.editFromDto(
            req.parsedBody,
            fieldsToUpdate
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/user/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await PersonsController.editUserFromDto(
            req.parsedBody ?? req.body
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/person/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await PersonsController.deleteFromDto(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/systemUser', async (req: Request, res: Response, next) => {
    try {
        const newUser = await PersonsController.addNewSystemUser(req.body);
        res.send(newUser);
    } catch (error) {
        next(error);
    }
});
