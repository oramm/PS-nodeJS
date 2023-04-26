import express, { Request, Response } from 'express'
import ContractsController from './ContractsController'
import { app, upload } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ContractType from './contractTypes/ContractType';
import { type } from 'os';

app.get('/contracts', async (req: Request, res: Response) => {
    try {
        let isArchived = false;
        if (typeof req.query.isArchived === 'string')
            isArchived = req.query.isArchived === 'true';
        const result = await ContractsController.getContractsList({ ...req.query, isArchived });
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
    }
});

app.get('/contract/:id', async (req: Request, res: Response) => {
    try {
        const result = await ContractsController.getContractsList(req.params || {});
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.post('/contract', upload.any(), async (req: Request, res: Response) => {
    try {
        const item = req.body._type.isOur ? new ContractOur(req.body) : new ContractOther(req.body);
        if (!item._parent || !item._parent.id)
            throw new Error('Nie przypisano projektu do kontraktu')

        //await ToolsGapi.gapiReguestHandler(req, res, item.addNewController, undefined, item);

        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    };
});

app.post('/contractReact', upload.any(), async (req: Request, res: Response) => {
    try {
        console.log('req.files', req.files);
        const formDataObject = req.body;

        const _type: ContractType = JSON.parse(formDataObject._type);
        const parsedDataFromClient = {
            ...formDataObject,
            //value: parseFloat(formDataObject.value),
            _type,
            _parent: JSON.parse(formDataObject._parent),
            ..._type.isOur && {
                _manager: JSON.parse(formDataObject._manager),
                _admin: JSON.parse(formDataObject._admin),
            },
            ...!_type.isOur && {
                _contractors: JSON.parse(formDataObject._contractors),
                _ourContract: JSON.parse(formDataObject._ourContract),
            }
        };


        console.log('req.body o%', parsedDataFromClient);

        const item = _type.isOur ? new ContractOur(parsedDataFromClient) : new ContractOther(parsedDataFromClient);
        if (!item._parent || !item._parent.id)
            throw new Error('Nie przypisano projektu do kontraktu')

        //await ToolsGapi.gapiReguestHandler(req, res, item.addNewController, undefined, item);

        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    };
});

app.put('/contract/:id', async (req: Request, res: Response) => {
    try {
        const item = (req.body._type.isOur) ? new ContractOur(req.body) : new ContractOther(req.body);
        if (!item.id) throw new Error(`Próba edycji kontraktu bez Id`);
        //console.log(`Contract %o updated`, item);

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

app.put('/sortProjects', async (req: Request, res: Response) => {
    try {

        await ToolsGapi.gapiReguestHandler(req, res, ScrumSheet.CurrentSprint.sortProjects);
        res.send("sorted");
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

app.delete('/contract/:id', async (req: Request, res: Response) => {
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