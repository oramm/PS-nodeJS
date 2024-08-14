import express, { Request, Response } from 'express';
import { app } from '../../index';
import ContractRangesController from './ContractRangesController';
import ContractRange from './ContractRange';
import { ContractRangeData } from '../../types/types';

app.post('/contractRanges', async (req: Request, res: Response) => {
    try {
        const orConditions = req.body.orConditions; // assuming parsedBody is replaced with body
        const result = await ContractRangesController.getContractRangesList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/contractRange', async (req: Request, res: Response) => {
    try {
        const itemData: ContractRangeData = req.body;
        const item = new ContractRange(itemData);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/contractRange/:id', async (req: Request, res: Response) => {
    try {
        const _fieldsToUpdate = req.body._fieldsToUpdate;
        const itemFromClient: ContractRangeData = req.body;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error('Próba edycji bez Id');

        const item = new ContractRange(itemFromClient);
        item.editInDb(undefined, false, _fieldsToUpdate);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/contractRange/:id', async (req: Request, res: Response) => {
    try {
        const itemData: ContractRangeData = req.body;
        const item = new ContractRange(itemData);
        await item.deleteFromDb();
        res.send(item);
        console.log(`Contract range ${item.name} deleted`);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});
