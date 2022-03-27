import Joi from 'joi';
import Person from './Person';
import PersonsController from './PersonsController';
import { app } from '../index'
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import Planning from '../ScrumSheet/Planning';
import CurrentSprint from '../ScrumSheet/CurrentSprint';

app.get('/persons', async (req: any, res: any) => {
    try {
        var result = await PersonsController.getPersonsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.get('/person/:id', async (req: any, res: any) => {
    try {
        var result = await PersonsController.getPersonsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.post('/person', async (req: any, res: any) => {
    try {
        const schema = {
            name: Joi.string(),
        };
        let item = new Person(req.body);
        delete item.systemRoleId;
        delete item.systemEmail;
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/person/:id', async (req: any, res: any) => {
    try {
        let item = new Person(req.body);
        delete item.systemRoleId;
        delete item.systemEmail;
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});
//TODO: dorobić
app.put('/user/:id', async (req: any, res: any) => {
    try {
        let item = new Person(req.body);
        await item.editInDb();
        //jeśłi użytjownik ENVI to trzeba zaktualizować scrumboard
        await ToolsGapi.gapiReguestHandler(req, res, ScrumSheet.Planning.refreshTimeAvailable, undefined, Planning);
        await ToolsGapi.gapiReguestHandler(req, res, ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas, undefined, CurrentSprint);

        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.get('/personsRefresh', async (req: any, res: any) => {
    try {
        await ToolsGapi.gapiReguestHandler(req, res, ScrumSheet.personsRefresh, undefined, ScrumSheet);
        res.send('scrum refreshed');
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/person/:id', async (req: any, res: any) => {
    try {
        let item = new Person(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});