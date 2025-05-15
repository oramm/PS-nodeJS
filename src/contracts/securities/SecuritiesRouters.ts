import express, { Request, Response } from 'express';
import { app, upload } from '../../index';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import SecuritiesController from './SecuritiesController';
import { Security } from './Security';

app.post('/securities', async (req: Request, res: Response, next) => {
    try {
        let isArchived = false;
        if (typeof req.body.isArchived === 'string')
            isArchived = req.body.isArchived === 'true';

        const orConditions = req.parsedBody.orConditions;

        const result = await SecuritiesController.getSecuritiesList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/security', async (req: Request, res: Response, next) => {
    try {
        console.log(req.parsedBody);
        if (typeof req.parsedBody.value === 'string')
            req.body.value = parseFloat(
                req.parsedBody.value.replace(/ /g, '').replace(',', '.')
            );
        req.parsedBody.contractId = req.parsedBody._contract.id;
        const item = new Security(req.parsedBody);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            (<Security>item).addNewController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/security/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        if (typeof itemFromClient.value === 'string')
            itemFromClient.value = parseFloat(
                itemFromClient.value.replace(/ /g, '').replace(',', '.')
            );
        const item = new Security(itemFromClient);
        if (!item.id) throw new Error(`Próba edycji ZNWU bez Id`);

        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            (<Security>item).editController,
            undefined,
            item
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/security/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new Security(req.parsedBody);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            (<Security>item).deleteController,
            undefined,
            item
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});
