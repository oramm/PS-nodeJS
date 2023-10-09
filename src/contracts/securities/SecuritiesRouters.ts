import express, { Request, Response } from 'express'
import { app, upload } from '../../index';
import ToolsGapi from '../../setup/GAuth2/ToolsGapi';
import SecuritiesController from './SecuritiesController';
import { Security } from './Security';


app.get('/securities', async (req: Request, res: Response) => {
    try {
        let isArchived = false;
        if (typeof req.parsedQuery.isArchived === 'string')
            isArchived = req.parsedQuery.isArchived === 'true';
        const result = await SecuritiesController.getSecuritiesList(req.parsedQuery);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/security', async (req: Request, res: Response) => {
    try {
        console.log(req.parsedBody);
        if (typeof req.parsedBody.value === "string")
            req.body.value = parseFloat(req.parsedBody.value.replace(/ /g, '').replace(',', '.'));
        req.parsedBody.contractId = req.parsedBody._contract.id;
        const item = new Security(req.parsedBody);
        await ToolsGapi.gapiReguestHandler(req, res, (<Security>item).addNewController, undefined, item);
        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/security/:id', async (req: Request, res: Response) => {
    try {
        const { item: itemFromClient, fieldsToUpdate } = req.parsedBody;
        if (typeof itemFromClient.value === "string")
            itemFromClient.value = parseFloat(itemFromClient.value.replace(/ /g, '').replace(',', '.'));
        const item = new Security(itemFromClient);
        if (!item.id) throw new Error(`Próba edycji ZNWU bez Id`);

        await ToolsGapi.gapiReguestHandler(req, res, (<Security>item).editController, undefined, item);

        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/security/:id', async (req: Request, res: Response) => {
    try {
        const item = new Security(req.parsedBody);
        await ToolsGapi.gapiReguestHandler(req, res, (<Security>item).deleteController, undefined, item);

        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});