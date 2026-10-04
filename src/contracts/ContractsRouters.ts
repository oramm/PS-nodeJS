import { Request, Response } from 'express';
import ContractsController, {
    ContractCreationOptions,
} from './ContractsController';
import ContractTemplatesTreeController from './contractTemplatesTree/ContractTemplatesTreeController';
import { parseOptionalFoldersSelection } from './contractFolders/optionalContractFolders';
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
import ToolsMail from '../tools/ToolsMail';
import ChatSpacesController from './chatSpaces/ChatSpacesController';

function getAsyncTaskErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
}

app.post('/contracts', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        let isArchived = false;
        if (typeof orConditions.isArchived === 'string')
            isArchived = orConditions.isArchived === 'true';
        const result = await ContractsController.find(
            orConditions,
            req.projectScope,
        );
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
            const result = await ContractsWithChildrenController.find(
                orConditions,
                req.projectScope,
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);

app.post(
    '/contractsSettlementData',
    async (req: Request, res: Response, next) => {
        try {
            const orConditions = req.parsedBody.orConditions;
            const result = await ContractsSettlementController.getSums(
                orConditions,
                req.projectScope,
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);

app.post('/contractReact', async (req: Request, res: Response, next) => {
    try {
        console.log('req.session', req.session);

        // Tworzenie odpowiedniej instancji Contract
        const contract = await ContractsController.createContractFromDto(
            req.parsedBody,
            true,
        );

        // Wybór z drzewa struktury - czytany z DTO wprost, bo jest jednorazową
        // instrukcją tworzenia, a nie stanem umowy (nie przechodzi przez model)
        const creationOptions: ContractCreationOptions = {
            milestonesSelection: ContractTemplatesTreeController.parseSelection(
                req.parsedBody._milestonesSelection,
            ),
            foldersSelection: parseOptionalFoldersSelection(
                req.parsedBody._contractFoldersSelection,
            ),
        };

        // Pokój Google Chat (CHT-3): jednorazowa instrukcja jak drzewo struktury, obsługiwana
        // PO commicie kontraktu. Brak pola = none.
        const chatSpaceSelection = ChatSpacesController.parseSelection(
            req.parsedBody._chatSpaceSelection,
        );

        // Inicjalizacja task tracking
        const taskId = crypto.randomUUID();
        TaskStore.create(taskId);

        // Odpowiedź HTTP 202 - przetwarzanie w tle
        res.status(202).send({
            progressMessage: 'Kontrakt w trakcie przetwarzania',
            status: 'processing',
            percent: 0,
            taskId,
        } as SessionTask);

        // Przetwarzanie w tle z autoryzacją
        setImmediate(async () => {
            try {
                // REFAKTORING: Użycie ContractsController.addWithAuth() zamiast ToolsGapi.gapiReguestHandler
                await ContractsController.addWithAuth(
                    contract,
                    taskId,
                    creationOptions,
                );
                // Chat nigdy nie wywraca tworzenia kontraktu: błąd = log + zgłoszenie,
                // kontrakt zostaje (provision... nie rzuca).
                if (chatSpaceSelection.mode !== 'none' && contract.id) {
                    const chat =
                        await ChatSpacesController.provisionAfterContractCreation(
                            contract.id,
                            chatSpaceSelection,
                            req.session?.userData?.enviId,
                        );
                    if (chat.chatSpaceId) contract.chatSpaceId = chat.chatSpaceId;
                    if (chat.error) {
                        console.error(
                            'Błąd pokoju Google Chat przy tworzeniu kontraktu (kontrakt zostaje):',
                            chat.error,
                        );
                        try {
                            await ToolsMail.sendServerErrorReport(
                                chat.error,
                                req,
                            );
                        } catch (mailError) {
                            console.error(
                                'Nie udało się wysłać zgłoszenia o błędzie Chatu:',
                                mailError,
                            );
                        }
                    }
                }
                TaskStore.complete(
                    taskId,
                    contract,
                    'Kontrakt pomyślnie zarejestrowany',
                );
            } catch (err) {
                console.error('Błąd podczas tworzenia kontraktu:', err);
                try {
                    await ToolsMail.sendServerErrorReport(err, req);
                } catch (mailError) {
                    console.error(
                        'Nie udało się wysłać maila o błędzie kontraktu:',
                        mailError,
                    );
                } finally {
                    TaskStore.fail(taskId, getAsyncTaskErrorMessage(err));
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

async function simulateTaskProgress(
    taskId: string,
    processedItem: any,
    throwError = false,
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
            '✅ Wszystkie kroki zakończone',
        );
    } catch (err) {
        TaskStore.fail(taskId, (err as Error).message);
        console.error('simulateTaskProgress error:', err);
    }
}

app.put('/contract/:id/move', async (req: Request, res: Response, next) => {
    try {
        const contractId = parseInt(req.params.id);
        const { newProjectOurId } = req.parsedBody;
        if (!contractId || !newProjectOurId)
            throw new Error(
                'Brak wymaganych parametrów: id kontraktu i newProjectOurId'
            );
        const result = await ContractsController.moveToProjectWithAuth(
            contractId,
            newProjectOurId
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/contract/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate: string[] | undefined =
            req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error(`Próba edycji kontraktu bez Id`);

        // Stwórz instancję odpowiedniej klasy
        const contractInstance =
            await ContractsController.createContractFromDto(
                itemFromClient,
                false,
            );

        // REFAKTORING: użyj ContractsController.editWithAuth()
        const updatedContract = await ContractsController.editWithAuth(
            contractInstance,
            _fieldsToUpdate,
        );

        res.send(updatedContract);
    } catch (error) {
        next(error);
    }
});

app.delete('/contract/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await ContractsController.createContractFromDto(
            req.body,
            false,
        );

        // REFAKTORING: użyj ContractsController.deleteWithAuth()
        const deletedContract = await ContractsController.deleteWithAuth(item);

        res.send(deletedContract);
    } catch (error) {
        next(error);
    }
});
