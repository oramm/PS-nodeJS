import express, { Request, Response } from 'express';
import ContractsController from './ContractsController';
import { app, upload } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ContractsWithChildrenController from './ContractsWithChildrenController';
import ContractsSettlementController from './ContractsSettlementController';
import { CityData, ContractTypeData } from '../types/types';

app.post('/contracts', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        let isArchived = false;
        if (typeof orConditions.isArchived === 'string')
            isArchived = orConditions.isArchived === 'true';
        const result = await ContractsController.getContractsList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/contractsWithChildren', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        let isArchived = false;
        if (typeof orConditions.isArchived === 'string')
            isArchived = orConditions.isArchived === 'true';
        const result = await ContractsWithChildrenController.getContractsList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/contractsSettlementData', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ContractsSettlementController.getSums(
            orConditions
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/contractReact', async (req: Request, res: Response) => {
    try {
        let item: ContractOur | ContractOther;
        if (typeof req.parsedBody.value === 'string')
            req.body.value = parseFloat(
                req.parsedBody.value.replace(/ /g, '').replace(',', '.')
            );
        if (req.parsedBody._type.isOur) {
            const ourId = await ContractsController.makeOurId(
                req.parsedBody._city as CityData,
                req.parsedBody._type as ContractTypeData
            );
            item = new ContractOur({ ...req.parsedBody, ourId });
        } else {
            item = new ContractOther(req.parsedBody);
        }
        if (!item._project || !item._project.id)
            throw new Error('Nie przypisano projektu do kontraktu');

        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.addNewController,
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

app.put('/contract/:id', async (req: Request, res: Response) => {
    try {
        const _fieldsToUpdate: string[] | undefined =
            req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error(`Próba edycji kontraktu bez Id`);

        //Jeśli tworzysz instancje klasy na podstawie obiektu, musisz przekazać 'itemFromClient'
        const contractInstance =
            itemFromClient.ourId || itemFromClient._type.isOur
                ? new ContractOur(itemFromClient)
                : new ContractOther(itemFromClient);
        await Promise.all([
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                contractInstance.editHandler,
                [_fieldsToUpdate],
                contractInstance
            ),
        ]);

        res.send(contractInstance);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.put('/sortProjects', async (req: Request, res: Response) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            ScrumSheet.CurrentSprint.sortProjects
        );
        res.send('sorted');
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/contract/:id', async (req: Request, res: Response) => {
    try {
        const item = req.body._type.isOur
            ? new ContractOur(req.body)
            : new ContractOther(req.body);
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.deleteFolder,
                undefined,
                item
            ),
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.deleteFromScrum,
                undefined,
                item
            ),
        ]);
        res.send(item);
        console.log(`Contract ${item.name} deleted`);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});
