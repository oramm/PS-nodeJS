import { Request, Response } from 'express';
import ContractsController from './ContractsController';
import { app } from '../index';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ContractsWithChildrenController from './ContractsWithChildrenController';
import ContractsSettlementController from './ContractsSettlementController';
import { CityData, ContractTypeData } from '../types/types';
import crypto from 'crypto'; // u góry pliku
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import { SessionTask } from '../types/sessionTypes';

app.post('/contracts', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        let isArchived = false;
        if (typeof orConditions.isArchived === 'string')
            isArchived = orConditions.isArchived === 'true';
        const result = await ContractsController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post(
    '/contractsWithChildren',
    async (req: Request, res: Response, next) => {
        try {
            const orConditions = req.parsedBody.orConditions;
            let isArchived = false;
            if (typeof orConditions.isArchived === 'string')
                isArchived = orConditions.isArchived === 'true';
            const result =
                await ContractsWithChildrenController.getContractsList(
                    orConditions
                );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/contractsSettlementData',
    async (req: Request, res: Response, next) => {
        try {
            const orConditions = req.parsedBody.orConditions;
            const result = await ContractsSettlementController.getSums(
                orConditions
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post('/contractReact', async (req: Request, res: Response, next) => {
    try {
        console.log('req.session', req.session);

        // Parsowanie wartości numerycznej
        if (typeof req.parsedBody.value === 'string') {
            req.body.value = parseFloat(
                req.parsedBody.value.replace(/ /g, '').replace(',', '.')
            );
        }

        // Tworzenie odpowiedniej instancji Contract
        let contract: ContractOur | ContractOther;
        if (req.parsedBody._type.isOur) {
            const ourId = await ContractsController.makeOurId(
                req.parsedBody._city as CityData,
                req.parsedBody._type as ContractTypeData
            );
            contract = new ContractOur({ ...req.parsedBody, ourId });
        } else {
            contract = new ContractOther(req.parsedBody);
        }

        // Walidacja
        if (!contract._project || !contract._project.id) {
            throw new Error('Nie przypisano projektu do kontraktu');
        }

        // Inicjalizacja task tracking
        const taskId = crypto.randomUUID();
        TaskStore.create(taskId);

        // Odpowiedź HTTP 202 - przetwarzanie w tle
        res.status(202).send({
            progressMesage: 'Kontrakt w trakcie przetwarzania',
            status: 'processing',
            percent: 0,
            taskId,
        } as SessionTask);

        // Przetwarzanie w tle z autoryzacją
        setImmediate(async () => {
            try {
                // REFAKTORING: Użycie ContractsController.addWithAuth() zamiast ToolsGapi.gapiReguestHandler
                await ContractsController.addWithAuth(contract, taskId);
                TaskStore.complete(
                    taskId,
                    contract,
                    'Kontrakt pomyślnie zarejestrowany'
                );
            } catch (err) {
                console.error('Błąd podczas tworzenia kontraktu:', err);
                TaskStore.fail(taskId, (err as Error).message);
            }
        });
    } catch (error) {
        next(error);
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

app.put('/contract/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate: string[] | undefined =
            req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error(`Próba edycji kontraktu bez Id`);

        // Stwórz instancję odpowiedniej klasy
        const contractInstance =
            itemFromClient.ourId || itemFromClient._type.isOur
                ? new ContractOur(itemFromClient)
                : new ContractOther(itemFromClient);

        // REFAKTORING: użyj ContractsController.editWithAuth()
        const updatedContract = await ContractsController.editWithAuth(
            contractInstance,
            _fieldsToUpdate
        );

        res.send(updatedContract);
    } catch (error) {
        next(error);
    }
});

app.delete('/contract/:id', async (req: Request, res: Response, next) => {
    try {
        const item = req.body._type.isOur
            ? new ContractOur(req.body)
            : new ContractOther(req.body);

        // REFAKTORING: użyj ContractsController.deleteWithAuth()
        const deletedContract = await ContractsController.deleteWithAuth(item);

        res.send(deletedContract);
    } catch (error) {
        next(error);
    }
});
