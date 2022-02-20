import RolesController from './RolesController'
import { app } from '../../index'
import Joi from 'joi';
import Role from './Role';

app.get('/roles', async (req: any, res: any) => {
    try {
        var result = await RolesController.getRolesList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.get('/role/:id', async (req: any, res: any) => {
    try {
        var result = await RolesController.getRolesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.post('/role', async (req: any, res: any) => {
    try {
        const schema = {
            name: Joi.string(),
        };
        let item = new Role(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/role/:id', async (req: any, res: any) => {
    try {
        let item = new Role(req.body);
        console.log(req.body);
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/role/:id', async (req: any, res: any) => {
    try {
        let item = new Role(req.body);
        console.log('delete');
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});