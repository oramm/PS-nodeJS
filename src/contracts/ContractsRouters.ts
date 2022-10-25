import express from 'express'
import ContractsController from './ContractsController'
import { app } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ScrumSheet from '../ScrumSheet/ScrumSheet';

app.get('/contracts', async (req: any, res: any) => {
    try {
        //odwróć zmienną bo nazwa isArchived czytelniejsza niż isActive
        if (typeof req.query.isArchived === 'string')
            req.query.isArchived = req.query.isArchived !== 'true';
        const result = await ContractsController.getContractsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.get('/contract/:id', async (req: any, res: any) => {
    try {
        const result = await ContractsController.getContractsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.post('/contract', async (req: any, res: any) => {

    try {
        const item = req.body._type.isOur ? new ContractOur(req.body) : new ContractOther(req.body);
        if (!item._parent || !item._parent.id)
            throw new Error('Nie przypisano projektu do kontraktu')

        await ToolsGapi.gapiReguestHandler(req, res, item.initialise, undefined, item);

        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    };
});

app.put('/contract/:id', async (req: any, res: any) => {
    try {
        const item = (req.body._type.isOur) ? new ContractOur(req.body) : new ContractOther(req.body);
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.editFolder, undefined, item),
            ToolsGapi.gapiReguestHandler(req, res, item.editInScrum, undefined, item),
            item.editInDb()
        ]);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.put('/sortProjects', async (req: any, res: any) => {
    try {

        await ToolsGapi.gapiReguestHandler(req, res, ScrumSheet.CurrentSprint.sortProjects);
        res.send("sorted");
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.delete('/contract/:id', async (req: any, res: any) => {
    try {
        const item = req.body._type.isOur ? new ContractOur(req.body) : new ContractOther(req.body);
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFolder, undefined, item),
            ToolsGapi.gapiReguestHandler(req, res, item.deleteFromScrum, undefined, item)
        ]);
        res.send(item);
        console.log(`Contract ${item.name} deleted`);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});