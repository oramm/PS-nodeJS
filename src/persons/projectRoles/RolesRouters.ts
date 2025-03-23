import RolesController from './RolesController';
import { app } from '../../index';
import Role from './Role';
import { Request, Response } from 'express';

app.post('/roles', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await RolesController.getRolesList(orConditions);
        res.send(result);
    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(err.message);
            console.error(err);
        }
    }
});

app.post('/role', async (req: Request, res: Response) => {
    try {
        RolesController.validateRole(req.parsedBody);
        const item = RolesController.createProperRole(req.parsedBody);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/role/:id', async (req: Request, res: Response) => {
    try {
        RolesController.validateRole(req.parsedBody);
        const item = RolesController.createProperRole(req.parsedBody);
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/role/:id', async (req: Request, res: Response) => {
    try {
        let item = new Role(req.body);
        console.log('delete');
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});
