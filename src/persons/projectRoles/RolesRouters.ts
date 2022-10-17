import RolesController from './RolesController'
import { app } from '../../index'
import Joi from 'joi';
import Role from './Role';

app.get('/roles', async (req: any, res: any) => {
    try {
        const result = await RolesController.getRolesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }


});

app.get('/role/:id', async (req: any, res: any) => {
    try {
        const result = await RolesController.getRolesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
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
        console.error(error);
    };
});

app.put('/role/:id', async (req: any, res: any) => {
    try {
        let item = new Role(req.body);
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.delete('/role/:id', async (req: any, res: any) => {
    try {
        let item = new Role(req.body);
        console.log('delete');
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});