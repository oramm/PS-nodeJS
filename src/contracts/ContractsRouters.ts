import express, { Request, Response } from 'express'
import ContractsController, { ContractSearchParamas as ContractSearchParams } from './ContractsController'
import { app, upload } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ContractType from './contractTypes/ContractType';
import Project from '../projects/Project';

function parseContractSearchFromQueryParams(requestParams: any) {
    const searchParams: ContractSearchParams = {
        searchText: requestParams.searchText ? requestParams.searchText : undefined,
        isArchived: requestParams.isArchived === 'true' ? true : false,
        contractName: requestParams.contractName,
        startDateFrom: requestParams.startDateFrom,
        startDateTo: requestParams.startDateTo,
        contractAlias: requestParams.contractAlias,
        onlyKeyData: requestParams.onlyKeyData === 'true' ? true : false,
        onlyOurs: requestParams.onlyOurs === 'true' ? true : false,
        contractOurId: requestParams.contractOurId,
        projectId: requestParams.projectId,
    };

    if (requestParams._contractType) {
        const _type: ContractType = JSON.parse(requestParams._contractType as string);
        searchParams.typeId = _type.id;
    }
    if (requestParams._parent) {
        const _parent: Project = JSON.parse(requestParams._parent as string);
        searchParams.projectId = _parent.ourId;
    }

    return searchParams;
}

app.get('/contracts', async (req: Request, res: Response) => {
    try {
        let isArchived = false;
        if (typeof req.query.isArchived === 'string')
            isArchived = req.query.isArchived === 'true';
        const searchParams = parseContractSearchFromQueryParams(req.query);
        const result = await ContractsController.getContractsList(searchParams);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/contract/:id', async (req: Request, res: Response) => {
    try {
        const result = await ContractsController.getContractsList(req.params || {});
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/contract', async (req: Request, res: Response) => {
    try {
        const item = req.body._type.isOur ? new ContractOur(req.body) : new ContractOther(req.body);
        if (!item._parent || !item._parent.id)
            throw new Error('Nie przypisano projektu do kontraktu')

        await ToolsGapi.gapiReguestHandler(req, res, item.addNewController, undefined, item);

        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.post('/contractReact', async (req: Request, res: Response) => {
    try {
        console.log('req.files', req.files);
        let item: ContractOur | ContractOther;
        req.parsedBody.value = parseFloat(req.parsedBody.value.replace(/ /g, '').replace(',', '.'));
        console.log('req.parsedBody', req.parsedBody);
        if (req.parsedBody._type.isOur) {
            item = new ContractOur(req.parsedBody);
        } else {
            item = new ContractOther(req.parsedBody);
        }
        if (!item._parent || !item._parent.id)
            throw new Error('Nie przypisano projektu do kontraktu')
        await ToolsGapi.gapiReguestHandler(req, res, item.addNewController, undefined, item);

        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/contract/:id', async (req: Request, res: Response) => {
    try {
        const item = (req.body._type.isOur) ? new ContractOur(req.body) : new ContractOther(req.body);
        if (!item.id) throw new Error(`Próba edycji kontraktu bez Id`);

        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.editFolder, undefined, item),
            ToolsGapi.gapiReguestHandler(req, res, item.editInScrum, undefined, item),
            item.editInDb()
        ]);

        res.send({ item });
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});


app.put('/sortProjects', async (req: Request, res: Response) => {
    try {

        await ToolsGapi.gapiReguestHandler(req, res, ScrumSheet.CurrentSprint.sortProjects);
        res.send("sorted");
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
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
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});