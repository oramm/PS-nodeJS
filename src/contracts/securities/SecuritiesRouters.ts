import { Request, Response } from 'express';
import { app } from '../../index';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import SecuritiesController from './SecuritiesController';

app.post('/securities', async (req: Request, res: Response, next) => {
    try {
        let isArchived = false;
        if (typeof req.body.isArchived === 'string')
            isArchived = req.body.isArchived === 'true';

        const orConditions = req.parsedBody.orConditions;

        const result = await SecuritiesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/security', async (req: Request, res: Response, next) => {
    try {
        console.log(req.parsedBody);
        // Logic moved to Model/Controller
        if (req.parsedBody._contract)
            req.parsedBody.contractId = req.parsedBody._contract.id;

        const result = await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth) =>
                await SecuritiesController.addFromDto(req.parsedBody, auth)
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/security/:id', async (req: Request, res: Response, next) => {
    try {
        const itemFromClient = req.parsedBody;
        if (!itemFromClient.id) throw new Error(`Próba edycji ZNWU bez Id`);

        const result = await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth) =>
                await SecuritiesController.editFromDto(itemFromClient, auth)
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/security/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth) =>
                await SecuritiesController.deleteFromDto(req.parsedBody, auth)
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});
