import express from 'express'
import Joi from 'joi';
import ToolsDb from '../tools/ToolsDb';
import Person from './Person';
import PersonsController from './PersonsController';
var app = express();
import session from 'express-session'

app.use(session({
    secret: 'raysources-secret-19890913007',
    resave: true,
    saveUninitialized: true
}));

app.get('/persons', async (req: any, res: any) => {
    try {
        var result = await PersonsController.getPersonsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/person/:id', async (req: any, res: any) => {
    try {
        var result = await PersonsController.getPersonsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.post('/person', async (req: any, res: any) => {
    try {
        const schema = {
            name: Joi.string(),
        };
        let item = new Person(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/person/:id', async (req: any, res: any) => {
    try {
        let item = new Person(req.body);
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/person/:id', async (req: any, res: any) => {
    try {
        let item = new Person(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = app;