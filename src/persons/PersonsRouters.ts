import PersonsController from './PersonsController';
import { app } from '../index';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

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
        let item = await PersonsController.addNewPerson(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/person/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await PersonsController.updatePerson(
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
        // Router obsługuje przepływ autoryzacji, a kontroler logikę biznesową
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const item = await PersonsController.updateUser(req.body, auth);
                res.send(item);
            }
        );
    } catch (error) {
        next(error);
    }
});

app.delete('/person/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await PersonsController.deletePerson(req.body);
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