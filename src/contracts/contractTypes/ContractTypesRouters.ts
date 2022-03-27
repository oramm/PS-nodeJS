import express from 'express'
import ContractTypesController from './ContractTypesController'
import { app } from '../../index';
import ContractType from './ContractType';

app.get('/contractTypes', async (req: any, res: any) => {
    try {
        var result = await ContractTypesController.getContractTypesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error)
            res.status(500).send(err.message);
    }


});

app.get('/contractType/:id', async (req: any, res: any) => {
    try {
        var result = await ContractTypesController.getContractTypesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.post('/contractType', async (req: any, res: any) => {
    try {
        let item = new ContractType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/contractType/:id', async (req: any, res: any) => {
    try {
        let item = new ContractType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/contractType/:id', async (req: any, res: any) => {
    try {
        let item = new ContractType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});