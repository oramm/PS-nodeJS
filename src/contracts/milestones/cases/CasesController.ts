import Case from './Case';
import CaseRepository, { CasesSearchParams } from './CaseRepository';
import { OAuth2Client } from 'google-auth-library';
import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import ProcessInstance from '../../../processes/processInstances/ProcessInstance';
import Task from './tasks/Task';
import TasksController from './tasks/TasksController';
import TaskTemplatesController from './tasks/taskTemplates/TaskTemplatesController';
import TasksTemplatesForProcessesController from './tasks/taskTemplates/TasksTemplatesForProcessesController';
import BaseController from '../../../controllers/BaseController';
import ToolsSheets from '../../../tools/ToolsSheets';
import Tools from '../../../tools/Tools';
import Setup from '../../../setup/Setup';

export default class CasesController extends BaseController<
    Case,
    CaseRepository
> {
    private static instance: CasesController;

    constructor() {
        super(new CaseRepository());
    }

    // Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
    private static getInstance(): CasesController {
        if (!this.instance) {
            this.instance = new CasesController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę Cases według podanych warunków
     *
     * REFAKTORING: Deleguje do CaseRepository.find()
     * Controller tylko orkiestruje - Repository obsługuje SQL i mapowanie
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<Case[]> - Lista znalezionych Cases
     */
    static async find(orConditions: CasesSearchParams[] = []): Promise<Case[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowy Case - wrapper używający withAuth
     *
     * @param caseItem - Case do dodania
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     * @returns Obiekt z caseItem, processInstances i defaultTasksInDb
     */
    static async add(
        caseItem: Case,
        auth?: OAuth2Client
    ): Promise<{
        caseItem: Case;
        processInstances: ProcessInstance[] | undefined;
        defaultTasksInDb: Task[];
    }> {
        return await this.withAuth<{
            caseItem: Case;
            processInstances: ProcessInstance[] | undefined;
            defaultTasksInDb: Task[];
        }>(async (instance: CasesController, authClient: OAuth2Client) => {
            return await instance.addCase(authClient, caseItem);
        }, auth);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje nowy Case do bazy wraz z powiązanymi danymi
     *
     * ZGODNIE Z WYTYCZNYMI:
     * - Controller orkiestruje operacje (transakcje, Repository, Model)
     * - Repository obsługuje tylko DB
     * - Model zawiera logikę domenową (GD, Scrum)
     *
     * Przepływ:
     * 1. Model: createFolder(auth) - logika GD
     * 2. Controller: transakcja DB
     *    - Repository: addWithRelated() - operacje DB
     *    - Przygotowanie ProcessInstances i Tasks
     * 3. Model: setDisplayNumber() - logika domenowa
     * 4. Model: editFolder(auth) - korekta nazwy folderu
     * 5. Model: addInScrum(auth) - dodanie do Scrum
     *
     * @param auth - OAuth2Client dla operacji GD
     * @param caseItem - Case do dodania
     * @returns Case z uzupełnionymi danymi
     */
    private async addCase(
        auth: OAuth2Client,
        caseItem: Case
    ): Promise<{
        caseItem: Case;
        processInstances: ProcessInstance[] | undefined;
        defaultTasksInDb: Task[];
    }> {
        console.group('CasesController.addCase()');

        try {
            // 1. Utwórz folder w Google Drive (logika domenowa - Model)
            await caseItem.createFolder(auth);
            console.log('folder created');

            let processInstances: ProcessInstance[] = [];
            let defaultTasks: Task[] = [];

            // 2. Transakcja DB (Controller zarządza transakcją - zgodnie z wytycznymi)
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                // 2a. Przygotuj ProcessInstances (w ramach transakcji)
                processInstances =
                    await CasesController.prepareProcessInstances(
                        caseItem,
                        conn
                    );

                // 2b. Przygotuj domyślne Tasks (w ramach transakcji)
                defaultTasks = await CasesController.prepareDefaultTasks(
                    caseItem
                );

                // 2c. Dodaj Case + powiązane dane do DB
                await this.repository.addWithRelated(
                    caseItem,
                    processInstances,
                    defaultTasks,
                    conn
                );
            });

            console.log('added in db');

            // 3. Ustaw display number (logika domenowa - Model)
            caseItem.setDisplayNumber();

            // 4. Operacje post-DB: GD i Scrum (równolegle)
            await Promise.all([
                caseItem
                    .editFolder(auth)
                    .then(() => console.log('folder name corrected'))
                    .catch((err) => console.log(err)),
                CasesController.addInScrum(caseItem, auth, defaultTasks)
                    .then(() => console.log('added in scrum'))
                    .catch((err) => console.log(err)),
            ]);

            return {
                caseItem,
                processInstances,
                defaultTasksInDb: defaultTasks,
            };
        } catch (err) {
            // Rollback GD: usuń folder jeśli transakcja DB się nie powiodła
            await caseItem
                .deleteFolder(auth)
                .then(() => console.log('folder deleted'))
                .catch((err) => console.log(err));
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * Przygotowuje ProcessInstances dla Case
     *
     * PRYWATNA: Pomocnicza dla add()
     * Tworzy instancje ProcessInstance na podstawie procesów z CaseType
     *
     * @param caseItem - Case dla którego tworzymy ProcessInstances
     * @param conn - Połączenie DB (część transakcji)
     * @returns Tablica ProcessInstance
     */
    private static async prepareProcessInstances(
        caseItem: Case,
        conn: mysql.PoolConnection
    ): Promise<ProcessInstance[]> {
        const result: ProcessInstance[] = [];

        if (
            !caseItem._type._processes ||
            caseItem._type._processes.length <= 0
        ) {
            return result;
        }

        // Typ sprawy może mieć wiele procesów - sprawa automatycznie też
        for (const process of caseItem._type._processes) {
            // utwórz obiekt zadania na podstawie szablonu, ale NIE zapisuj go teraz do DB
            // (zapisywanie nastąpi w repository.addWithRelated po dodaniu Case)
            const templates =
                await TasksTemplatesForProcessesController.getTasksTemplateForProcesssList(
                    { processId: process.id }
                );
            const taskTemplate =
                templates && templates.length > 0 ? templates[0] : undefined;
            if (!taskTemplate) continue;

            const processInstanceTask = new Task({
                name: taskTemplate.name,
                description: taskTemplate.description,
                status: 'Backlog',
                _parent: caseItem,
            });

            const processInstance = new ProcessInstance({
                _process: process,
                _case: caseItem,
                _task: processInstanceTask,
            });

            result.push(processInstance);
        }

        return result;
    }

    /**
     * Przygotowuje domyślne Tasks dla Case
     *
     * PRYWATNA: Pomocnicza dla add()
     * Tworzy Tasks na podstawie TaskTemplates dla danego CaseType
     *
     * @param caseItem - Case dla którego tworzymy Tasks
     * @returns Tablica Task
     */
    private static async prepareDefaultTasks(caseItem: Case): Promise<Task[]> {
        const defaultTasks: Task[] = [];

        // Pobierz szablony zadań dla tego typu sprawy
        const defaultTaskTemplates =
            await TaskTemplatesController.getTaskTemplatesList({
                caseTypeId: caseItem.typeId,
            });

        for (const template of defaultTaskTemplates) {
            const task = new Task({
                name: template.name,
                description: template.description,
                status: template.status ? template.status : 'Nie rozpoczęty',
                _parent: caseItem,
                _owner: CasesController.makeTaskOwner(caseItem),
            });
            defaultTasks.push(task);
        }

        return defaultTasks;
    }

    /**
     * Tworzy właściciela zadania (owner) na podstawie Case
     *
     * PRYWATNA: Pomocnicza dla prepareDefaultTasks()
     * Logika biznesowa: owner = manager kontraktu (jeśli istnieje)
     *
     * @param caseItem - Case
     * @returns Owner lub undefined
     */
    private static makeTaskOwner(caseItem: Case): any {
        if (
            caseItem._parent?._contract &&
            '_manager' in caseItem._parent._contract
        ) {
            return caseItem._parent._contract._manager;
        }
        return undefined;
    }

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Edytuje Case - wrapper używający withAuth
     *
     * @param caseItem - Case do edycji
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     * @returns Zaktualizowany Case
     */
    static async edit(caseItem: Case, auth?: OAuth2Client): Promise<Case> {
        return await this.withAuth<Case>(
            async (instance: CasesController, authClient: OAuth2Client) => {
                return await instance.editCase(authClient, caseItem);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Edytuje Case w bazie wraz z powiązanymi danymi
     *
     * ZGODNIE Z WYTYCZNYMI:
     * - Controller orkiestruje operacje (transakcje, Repository, Model)
     * - Repository obsługuje tylko DB
     * - Model zawiera logikę domenową (GD, Scrum)
     *
     * Przepływ:
     * 1. Controller: transakcja DB
     *    - Repository: editWithRelated() - operacje DB
     *    - Opcjonalnie: reset ProcessInstances (jeśli zmiana typu)
     * 2. Model: editFolder(auth) - aktualizacja GD
     * 3. Model: editInScrum(auth) - aktualizacja Scrum
     *
     * @param auth - OAuth2Client dla operacji GD
     * @param caseItem - Case do edycji
     * @returns Zaktualizowany Case
     */
    private async editCase(auth: OAuth2Client, caseItem: Case): Promise<Case> {
        console.group('CasesController.editCase()');

        try {
            // Sprawdź czy trzeba zresetować ProcessInstances
            const shouldResetProcessInstances =
                caseItem._processesInstances !== undefined &&
                caseItem._processesInstances.length > 0;

            let newProcessInstances: ProcessInstance[] = [];

            // Transakcja DB (Controller zarządza transakcją - zgodnie z wytycznymi)
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                // Przygotuj nowe ProcessInstances (jeśli reset)
                if (shouldResetProcessInstances) {
                    newProcessInstances =
                        await CasesController.prepareProcessInstances(
                            caseItem,
                            conn
                        );
                }

                // Edytuj Case + opcjonalnie ProcessInstances
                await this.repository.editWithRelated(
                    caseItem,
                    shouldResetProcessInstances,
                    newProcessInstances,
                    conn
                );
            });

            console.log('edited in db');

            // Operacje post-DB: GD i Scrum (równolegle)
            await Promise.all([
                caseItem
                    .editFolder(auth)
                    .then(() => console.log('folder updated'))
                    .catch((err) => console.log(err)),
                caseItem
                    .editInScrum(auth)
                    .then(() => console.log('updated in scrum'))
                    .catch((err) => console.log(err)),
            ]);

            return caseItem;
        } catch (err) {
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa Case - wrapper używający withAuth
     *
     * @param caseItem - Case do usunięcia
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     */
    static async delete(caseItem: Case, auth?: OAuth2Client): Promise<void> {
        return await this.withAuth<void>(
            async (instance: CasesController, authClient: OAuth2Client) => {
                return await instance.deleteCase(authClient, caseItem);
            },
            auth
        );
    }

    /**
     * Dodaje Case do arkusza Scrum i domyślne zadania do scrumboarda
     * PRZENIESIONE Z Case.ts - Controller orkiestruje inne Controllery
     *
     * @param caseItem - Case do dodania do Scrum
     * @param auth - OAuth2Client dla operacji Google Sheets
     * @param defaultTasks - Lista domyślnych zadań do dodania
     * @param isPartOfBatch - Czy jest częścią większej operacji
     */
    static async addInScrum(
        caseItem: Case,
        auth: OAuth2Client,
        defaultTasks: Task[],
        isPartOfBatch?: boolean
    ): Promise<void> {
        const caseData = [
            caseItem.id,
            caseItem.typeId,
            caseItem.milestoneId,
            caseItem.makenameCaption(),
            caseItem.gdFolderId ? caseItem.gdFolderId : '',
        ];
        let scrumDataValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.Data.name,
            })
        ).values;

        if (
            !Tools.findFirstInRange(
                <number>caseItem.id,
                scrumDataValues,
                scrumDataValues[0].indexOf(Setup.ScrumSheet.Data.caseIdColName)
            )
        )
            ToolsSheets.appendRowsToSpreadSheet(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetName: Setup.ScrumSheet.Data.name,
                values: [caseData],
            });
        console.log(`added case ${caseItem._type.name} do sheet "Data"`);
        //dodaj sprawę do arkusza currentSprint
        console.groupCollapsed('adding default tasks to scrumboard');
        for (const task of defaultTasks)
            await TasksController.addInScrum(
                task,
                auth,
                undefined,
                isPartOfBatch
            );
        console.log('default tasks added to scrumboard');
        console.groupEnd();
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa Case z bazy wraz z powiązanymi danymi
     *
     * ZGODNIE Z WYTYCZNYMI:
     * - Controller orkiestruje operacje (transakcje, Repository, Model)
     * - Repository obsługuje tylko DB
     * - Model zawiera logikę domenową (GD, Scrum)
     *
     * Przepływ:
     * 1. Controller: transakcja DB
     *    - Repository: deleteFromDb() - usuwa Case (CASCADE dla ProcessInstances)
     * 2. Model: deleteFolder(auth) - usuwa folder GD
     * 3. Model: deleteFromScrumSheet(auth) - usuwa z Scrum
     *
     * @param auth - OAuth2Client dla operacji GD
     * @param caseItem - Case do usunięcia
     */
    private async deleteCase(
        auth: OAuth2Client,
        caseItem: Case
    ): Promise<void> {
        console.group('CasesController.deleteCase()');

        try {
            // Transakcja DB (Controller zarządza transakcją - zgodnie z wytycznymi)
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                // Usuń Case (CASCADE usunie ProcessInstances)
                await this.repository.deleteFromDb(caseItem, conn, true);
            });

            console.log('deleted from db');

            // Operacje post-DB: GD i Scrum (równolegle)
            await Promise.all([
                caseItem
                    .deleteFolder(auth)
                    .then(() => console.log('folder deleted'))
                    .catch((err) => console.log(err)),
                caseItem
                    .deleteFromScrumSheet(auth)
                    .then(() => console.log('deleted from scrum'))
                    .catch((err) => console.log(err)),
            ]);
        } catch (err) {
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}
