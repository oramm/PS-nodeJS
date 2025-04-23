import { Request, Response } from 'express';
import ContractsController from './ContractsController';
import { app } from '../index';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ContractsWithChildrenController from './ContractsWithChildrenController';
import ContractsSettlementController from './ContractsSettlementController';
import { CityData, ContractTypeData } from '../types/types';
import crypto from 'crypto'; // u góry pliku
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import { SessionTask } from '../types/sessionTypes';

const taskStore: Record<string, any> = {};

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
        console.log('req.session', req.session);
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

        const taskId = crypto.randomUUID();
        TaskStore.create(taskId);

        res.status(202).send({
            progressMesage: 'Kontrakt w trakcie przetwarzania',
            status: 'processing',
            percent: 0,
            taskId,
        } as SessionTask);

        // Przetwarzanie w tle
        setImmediate(async () => {
            try {
                await ToolsGapi.gapiReguestHandler(
                    req,
                    res,
                    item.addNewController,
                    [taskId],
                    item
                );
                TaskStore.complete(
                    taskId,
                    item,
                    'Kontrakt pomyślnie zarejestrowany'
                );
            } catch (err) {
                console.error('Błąd async GAPI:', err);
                TaskStore.fail(taskId, (err as Error).message);
            }
        });
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

async function simulateTaskProgress(
    taskId: string,
    processedItem: any,
    throwError = false
) {
    try {
        TaskStore.update(taskId, 'Rozpoczęcie przetwarzania', 0);
        // Krok 1
        TaskStore.update(taskId, 'Krok 1 z 3', 33);
        await new Promise((res) => setTimeout(res, 3000));

        // Krok 2
        TaskStore.update(taskId, 'Krok 2 z 3', 66);
        await new Promise((res) => setTimeout(res, 2000));

        // Krok 3
        TaskStore.update(taskId, 'Krok 3 z 3', 100);
        await new Promise((res) => setTimeout(res, 2000));

        // Ewentualny błąd
        if (throwError) throw new Error('Błąd symulowany w kroku 3');

        // Zakończ
        TaskStore.complete(
            taskId,
            processedItem,
            '✅ Wszystkie kroki zakończone'
        );
    } catch (err) {
        TaskStore.fail(taskId, (err as Error).message);
        console.error('simulateTaskProgress error:', err);
    }
}

app.get('/contractStatus/:taskId', (req: Request, res: Response) => {
    const taskId = req.params.taskId;
    const task = TaskStore.get(taskId);
    if (!task) return res.status(404).send({ error: 'Nie znaleziono taska' });
    const { timeout, ...taskWithoutTimeout } = task;
    res.send(taskWithoutTimeout);

    // usuń po odebraniu, jeśli zakończony
    if (['done', 'error'].includes(task.status)) {
        TaskStore.remove(taskId);
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
