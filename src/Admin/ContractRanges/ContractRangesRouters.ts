import { Request, Response } from 'express';
import { app } from '../../index';
import ContractRangesController from './ContractRangesController';
import { ContractRangeData } from '../../types/types';

app.post('/contractRanges', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.body.orConditions; // assuming parsedBody is replaced with body
        const result = await ContractRangesController.find(
            orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/contractRange', async (req: Request, res: Response, next) => {
    try {
        const item= await ContractRangesController.addNewContractRange(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/contractRange/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.body._fieldsToUpdate;
        const itemFromClient: ContractRangeData = req.body;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error('Próba edycji bez Id');
        const updateContractRange = await ContractRangesController.updateContractRange(itemFromClient, fieldsToUpdate);
        res.send(updateContractRange);
    } catch (error) {
        next(error);
    }
});

app.delete('/contractRange/:id', async (req: Request, res: Response, next) => {
    try {
        const itemFromClient: ContractRangeData = req.body;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error('Próba usunięcia bez Id');

        await ContractRangesController.deleteContractRange(itemFromClient);
        res.json({id: itemFromClient.id, name: itemFromClient.name});
    } catch (error) {
        next(error);
    }
});
