import Person from './Person';
import PersonsController from './PersonsController';
import { app } from '../index';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import Planning from '../ScrumSheet/Planning';
import CurrentSprint from '../ScrumSheet/CurrentSprint';
import { Request, Response } from 'express';

app.post('/persons', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await PersonsController.getPersonsList(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/person', async (req: Request, res: Response, next) => {
    try {
        let item = new Person(req.body);
        if (!item._entity.id) throw new Error('No entity id');
        delete item.systemRoleId;
        delete item.systemEmail;
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/person/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Person(req.body);
        delete item.systemRoleId;
        delete item.systemEmail;
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
//TODO: dorobić
app.put('/user/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Person(req.body);
        await item.editInDb();
        //jeśłi użytjownik ENVI to trzeba zaktualizować scrumboard
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            ScrumSheet.Planning.refreshTimeAvailable,
            undefined,
            Planning
        );
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas,
            undefined,
            CurrentSprint
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.get('/personsRefresh', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            ScrumSheet.personsRefresh,
            undefined,
            ScrumSheet
        );
        res.send('scrum refreshed');
    } catch (error) {
        next(error);
    }
});

app.delete('/person/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Person(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
