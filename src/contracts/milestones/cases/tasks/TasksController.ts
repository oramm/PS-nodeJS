import mysql from 'mysql2/promise';
import ToolsDb from '../../../../tools/ToolsDb';
import Case from '../Case';
import Task from './Task';
import Milestone from '../../Milestone';
import ToolsGd from '../../../../tools/ToolsGd';
import ToolsDate from '../../../../tools/ToolsDate';
import { OtherContractData, OurContractData } from '../../../../types/types';
import TaskRepository, { TasksSearchParams } from './TaskRepository';
import Process from '../../../../processes/Process';
import TasksTemplateForProcesssController from './taskTemplates/TasksTemplatesForProcessesController';
import CurrentSprint from '../../../../ScrumSheet/CurrentSprint';
import BaseController from '../../../../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import ToolsSheets from '../../../../tools/ToolsSheets';
import Tools from '../../../../tools/Tools';
import Setup from '../../../../setup/Setup';
import { MilestoneData } from '../../../../types/types';
import PersonsController from '../../../../persons/PersonsController';
import { TaskData } from '../../../../types/types';

export type { TasksSearchParams };

type TaskPayload = TaskData & { _case?: any };

export default class TasksController extends BaseController<
    Task,
    TaskRepository
> {
    private static instance: TasksController;

    constructor() {
        super(new TaskRepository());
    }

    private static getInstance(): TasksController {
        if (!this.instance) {
            this.instance = new TasksController();
        }
        return this.instance;
    }

    // ==================== READ (bez auth) ====================
    /**
     * Wyszukuje zadania według parametrów
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<Task[]> - Lista zadań
     */
    static async find(searchParams: TasksSearchParams[] = []): Promise<Task[]> {
        const instance = this.getInstance();
        return instance.repository.find(searchParams);
    }

    // ==================== CREATE ====================
    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowe zadanie do systemu
     *
     * @param taskPayload - Dane zadania do dodania
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     * @returns Promise<Task> - Dodane zadanie
     */
    static async add(
        taskPayload: TaskPayload,
        auth?: OAuth2Client
    ): Promise<Task> {
        return await this.withAuth<Task>(
            async (instance: TasksController, authClient: OAuth2Client) => {
                return await instance.addTask(authClient, taskPayload);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje zadanie - orkiestruje DB i Scrum operations
     *
     * @param auth - OAuth2Client dla operacji Google Sheets
     * @param taskPayload - Dane zadania do dodania
     * @returns Promise<Task> - Dodane zadanie
     */
    private async addTask(
        auth: OAuth2Client,
        taskPayload: TaskPayload
    ): Promise<Task> {
        console.group('TasksController.addTask()');
        try {
            const { _case, ...rest } = taskPayload;
            const task = new Task({ ...rest, _parent: _case });

            // 1. Dodaj do DB
            await this.create(task);
            console.log('Task added to DB');

            // 2. Dodaj do Scrum Sheet
            await TasksController.addInScrum(task, auth);
            console.log(`Task ${task.name} added to Scrum`);

            return task;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== UPDATE ====================
    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Aktualizuje istniejące zadanie
     *
     * @param taskPayload - Dane zadania do aktualizacji
     * @param fieldsToUpdate - Lista pól do aktualizacji
     * @param auth - Opcjonalny OAuth2Client
     * @returns Promise<Task> - Zaktualizowane zadanie
     */
    static async edit(
        taskPayload: TaskPayload,
        fieldsToUpdate: string[],
        auth?: OAuth2Client
    ): Promise<Task> {
        return await this.withAuth<Task>(
            async (instance: TasksController, authClient: OAuth2Client) => {
                return await instance.editTask(
                    authClient,
                    taskPayload,
                    fieldsToUpdate
                );
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Edytuje zadanie - orkiestruje DB i Scrum operations
     *
     * @param auth - OAuth2Client dla operacji Google Sheets
     * @param taskPayload - Dane zadania do aktualizacji
     * @param fieldsToUpdate - Lista pól do aktualizacji
     * @returns Promise<Task> - Zaktualizowane zadanie
     */
    private async editTask(
        auth: OAuth2Client,
        taskPayload: TaskPayload,
        fieldsToUpdate: string[]
    ): Promise<Task> {
        console.group('TasksController.editTask()');
        try {
            const { _case, ...rest } = taskPayload;
            const task = new Task({ ...rest, _parent: _case });

            // Równoległe wykonanie DB i Scrum update
            const dbPromise = this.repository.editInDb(
                task,
                undefined,
                undefined,
                fieldsToUpdate
            );
            const scrumPromise = TasksController.editInScrum(task, auth);
            await Promise.all([dbPromise, scrumPromise]);

            console.log(`Task ${task.name} updated`);
            return task;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================
    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa zadanie z systemu
     *
     * @param taskPayload - Dane zadania do usunięcia
     * @param auth - Opcjonalny OAuth2Client
     * @returns Promise<{id: number | undefined}> - ID usuniętego zadania
     */
    static async delete(
        taskPayload: TaskPayload,
        auth?: OAuth2Client
    ): Promise<{ id: number | undefined }> {
        return await this.withAuth<{ id: number | undefined }>(
            async (instance: TasksController, authClient: OAuth2Client) => {
                return await instance.deleteTask(authClient, taskPayload);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa zadanie - orkiestruje DB i Scrum operations
     *
     * @param auth - OAuth2Client dla operacji Google Sheets
     * @param taskPayload - Dane zadania do usunięcia
     * @returns Promise<{id: number | undefined}> - ID usuniętego zadania
     */
    private async deleteTask(
        auth: OAuth2Client,
        taskPayload: TaskPayload
    ): Promise<{ id: number | undefined }> {
        console.group('TasksController.deleteTask()');
        try {
            const { _case, ...rest } = taskPayload;
            const task = new Task({ ...rest, _parent: _case });

            // Równoległe wykonanie DB i Scrum delete
            const dbPromise = this.repository.deleteFromDb(task);
            const scrumPromise = TasksController.deleteFromScrum(task, auth);
            await Promise.all([dbPromise, scrumPromise]);

            console.log(`Task with id ${task.id} deleted`);
            return { id: task.id };
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DEPRECATED (dla kompatybilności wstecznej) ====================
    /**
     * @deprecated Użyj TasksController.add(taskPayload, auth) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async addNewTask(
        taskPayload: TaskPayload,
        auth?: OAuth2Client
    ): Promise<Task> {
        return await this.add(taskPayload, auth);
    }

    /**
     * @deprecated Użyj TasksController.edit(taskPayload, fieldsToUpdate, auth) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async updateTask(
        taskPayload: TaskPayload,
        fieldsToUpdate: string[],
        auth?: OAuth2Client
    ): Promise<Task> {
        return await this.edit(taskPayload, fieldsToUpdate, auth);
    }

    /**
     * @deprecated Użyj TasksController.delete(taskPayload, auth) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async deleteTask(
        taskPayload: TaskPayload,
        auth?: OAuth2Client
    ): Promise<{ id: number | undefined }> {
        return await this.delete(taskPayload, auth);
    }

    static processTasksResult(result: any[]): Task[] {
        let newResult: Task[] = [];

        for (const row of result) {
            const item = new Task({
                id: row.Id,
                name: ToolsDb.sqlToString(row.TaskName),
                description: ToolsDb.sqlToString(row.TaskDescription),
                deadline: row.TaskDeadline,
                status: row.TaskStatus,
                _owner: {
                    id: row.OwnerId ? row.OwnerId : undefined,
                    name: row.OwnerName ? row.OwnerName : '',
                    surname: row.OwnerSurname ? row.OwnerSurname : '',
                    email: row.OwnerEmail ? row.OwnerEmail : '',
                },
                _parent: new Case({
                    id: row.CaseId,
                    name: ToolsDb.sqlToString(row.CaseName),
                    description: ToolsDb.sqlToString(row.CaseDescription),
                    gdFolderId: row.CaseGdFolderId,
                    _type: {
                        id: row.CaseTypeId,
                        name: row.CaseTypeName,
                        isDefault: row.IsDefault,
                        isUniquePerMilestone: row.IsUniquePerMilestone,
                        milestoneTypeId: row.MilestoneTypeId,
                        folderNumber: row.CaseTypeFolderNumber,
                    },
                    _parent: new Milestone({
                        id: row.MilestoneId,
                        name: row.MilestoneName,
                        gdFolderId: row.MilestoneGdFolderId,
                        _type: {
                            id: row.MilestoneTypeId,
                            name: row.MilestoneTypeName,
                            _folderNumber: row.MilestoneTypeFolderNumber,
                            isUniquePerContract: row.IsUniquePerContract,
                        },
                        _contract: {
                            //Contract
                            id: row.ContractId,
                            ourId: row.ContractOurId,
                            number: row.ContractNumber,
                            name: ToolsDb.sqlToString(row.ContractName),
                            comment: ToolsDb.sqlToString(row.ContractComment),
                            startDate: ToolsDate.dateJsToSql(
                                row.ContractStartDate
                            ),
                            endDate: ToolsDate.dateJsToSql(row.ContractEndDate),
                            value: row.ContractValue,
                            status: row.ContractStatus,
                            gdFolderId: row.ContractGdFolderId,
                            _gdFolderUrl: ToolsGd.createGdFolderUrl(
                                row.ContractGdFolderId
                            ),
                            alias: row.ContractAlias,
                            _type: {
                                name: row.ContractTypeName,
                                isOur: row.ContractOurId ? true : false,
                            },
                            _manager: row.ContractManagerEmail
                                ? {
                                      id: row.ContractManagerId,
                                      name: row.ContractManagerName,
                                      surname: row.ContractManagerSurname,
                                      email: row.ContractManagerEmail,
                                  }
                                : undefined,
                            _admin: row.ContractAdminEmail
                                ? {
                                      id: row.ContractAdminId,
                                      name: row.ContractAdminName,
                                      surname: row.ContractAdminSurname,
                                      email: row.ContractAdminEmail,
                                  }
                                : undefined,
                            _project: {},
                        } as OurContractData | OtherContractData,
                        _offer: {
                            id: row.OfferId,
                            status: '',
                            alias: '',
                            _type: { name: '', isOur: false },
                            _city: { code: '', name: '' },
                            bidProcedure: '',
                            isOur: false,
                            form: '',
                        },
                        _dates: [],
                    }),
                }),
            });
            newResult.push(item);
        }
        return newResult;
    }

    /* Służy do dodwania zadań domyślnych dla procesów. Jest odpalana w addNewProcessInstancesForCaseInDb()
     *
     */
    static async addInDbFromTemplateForProcess(
        process: Process,
        parentCase: Case,
        conn: mysql.PoolConnection,
        isPartOfTransaction: boolean
    ) {
        console.log(
            'addInDbFromTemplateForProcess:: connection Id',
            conn.threadId
        );
        const taskTemplate = (
            await TasksTemplateForProcesssController.find({
                processId: process.id,
            })
        )[0];
        if (taskTemplate) {
            const task = new Task({
                name: taskTemplate.name,
                description: taskTemplate.description,
                status: 'Backlog',
                _parent: parentCase,
            });
            const instance = this.getInstance();
            return await instance.repository.addInDb(
                task,
                conn,
                isPartOfTransaction
            );
            //return await task.addInDb(conn, isPartOfTransaction);
        }
    }

    private static async getParents(
        caseId: number,
        externalConnection: mysql.PoolConnection
    ) {
        console.log('Task getParents', externalConnection.threadId);
        const caseCondition = mysql.format('Cases.Id = ?', [caseId]);

        const sql = `SELECT
            Cases.Name AS CaseName,
            Cases.GdFolderId AS CaseGdFolderId,
            Cases.TypeId AS CaseTypeId,
            Cases.Number AS CaseNumber,
            CaseTypes.Name AS CaseTypeName,
            CaseTypes.FolderNumber AS CaseTypeFolderNumber,
            Milestones.Id AS MilestoneId,
            Milestones.Name AS MilestoneName,
            Milestones.GdFolderId AS MilestoneGdFolderId,
            MilestoneTypes.Name AS MilestoneTypeName,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
            ParentContracts.Id AS ParentContractId,
            OurContractsData.OurId AS OurContractsDataOurId,
            ParentContracts.OurIdRelated AS ParentContractOurIdRelated,
            ParentContracts.Number AS ParentContractNumber,
            ParentContracts.Alias AS ParentContractAlias,
            ParentContracts.ProjectOurId
            FROM Cases
            LEFT JOIN CaseTypes ON CaseTypes.Id=Cases.TypeId
            JOIN Milestones ON Milestones.Id=Cases.MilestoneId
            LEFT JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            JOIN Contracts AS ParentContracts ON Milestones.ContractId = ParentContracts.Id
            LEFT JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id
            JOIN ContractTypes ON ContractTypes.Id = ParentContracts.TypeId
            LEFT JOIN MilestoneTypes_ContractTypes 
                ON  MilestoneTypes_ContractTypes.ContractTypeId=ContractTypes.Id 
                AND MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId=MilestoneTypes.Id
            WHERE ${caseCondition}`;

        const result: any[] = <any[]>(
            await ToolsDb.getQueryCallbackAsync(sql, externalConnection)
        );
        try {
            var row = result[0];
            return {
                caseName: <string | undefined>row.CaseName,
                caseGdFolderId: <string | undefined>row.CaseGdFolderId,
                caseTypeId: <number>row.CaseTypeId,
                caseNumber: <number>row.CaseNumber,
                caseTypeName: <string>row.CaseTypeName,
                caseTypeFolderNumber: <string>row.CaseTypeFolderNumber,
                milestoneId: <number>row.MilestoneId,
                milestoneName: <string>row.MilestoneName,
                milestoneTypeName: <string>row.MilestoneTypeName,
                milestoneTypeFolderNumber: <string>(
                    row.MilestoneTypeFolderNumber
                ),
                milestoneGdFolderId: <string>row.MilestoneGdFolderId,
                contractId: <number>row.ParentContractId,
                contractOurId: <string>row.OurContractsDataOurId, //dla ourContracts
                contractOurIdRelated: <string>row.ParentContractOurIdRelated, //dla kontraktów na roboty
                contractNumber: <string>row.ParentContractNumber,
                contractAlias: <string>row.ParentContractAlias,
                projectId: <string>row.ProjectOurId,
            };
        } catch (err) {
            throw err;
        }
    }

    static async addInScrum(
        task: Task,
        auth: OAuth2Client,
        externalConn?: mysql.PoolConnection,
        isPartOfBatch?: boolean
    ) {
        const conn: mysql.PoolConnection = externalConn
            ? externalConn
            : await ToolsDb.pool.getConnection();
        console.log('Task addInScrum:: connection Id', conn.threadId);

        try {
            if (!(await this.shouldBeInScrum(task, auth, conn))) {
                //console.log(`Nie dodaję do Scruma zadania: "${this.name}"`);
                return;
            }
            if (!task.caseId) {
                throw new Error(
                    'Task must have a caseId to be added to Scrum.'
                );
            }
            const parents = await this.getParents(task.caseId, conn);
            let currentSprintValues = <any[][]>(
                await ToolsSheets.getValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                })
            ).values;

            const contractOurIdColIndex = currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.contractOurIdColName
            );
            //dla kontraktu 'Our' bierz dane z ourData, dla kontraktu na roboty bież dane z kolumny OurIdRelated
            const ourContractOurId = parents.contractOurId
                ? parents.contractOurId
                : parents.contractOurIdRelated;
            //const headerContractRow = <number>Tools.findFirstInRange(ourContractOurId, currentSprintValues, contractOurIdColIndex) + 1;
            const lastContractRow =
                <number>(
                    Tools.findLastInRange(
                        ourContractOurId,
                        currentSprintValues,
                        contractOurIdColIndex
                    )
                ) + 1;
            //const contractTasksRowsCount = lastContractRow - headerContractRow;
            //wstaw wiersz nowej sprawy
            await ToolsSheets.insertRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.CurrentSprint.id,
                startIndex: lastContractRow,
                endIndex: lastContractRow + 1,
            });

            task.scrumSheetRow = lastContractRow + 1;
            console.log(`new blank row no ${lastContractRow} inserted`);
            //wyełnij danymi https://developers.google.com/sheets/api/samples/data#copy_and_paste_cell_formatting
            const timesColIndex = currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.timesColName
            );
            await Promise.all([
                ToolsSheets.copyPasteRows(auth, {
                    source: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow + 2,
                        endRowIndex: lastContractRow + 3,
                    },
                    destination: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow,
                        endRowIndex: lastContractRow + 1,
                    },
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    pasteType: 'PASTE_FORMAT',
                }),
                ToolsSheets.copyPasteRows(auth, {
                    source: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow + 2,
                        endRowIndex: lastContractRow + 3,
                        startColumnIndex: timesColIndex,
                        endColumnIndex: timesColIndex + 20,
                    },
                    destination: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow,
                        endRowIndex: lastContractRow + 1,
                        startColumnIndex: timesColIndex,
                    },
                    spreadsheetId: Setup.ScrumSheet.GdId,
                }),
            ]);
            const milestoneGdFolderUrl = ToolsGd.createGdFolderUrl(
                parents.milestoneGdFolderId
            );
            const milestoneNameCaption = parents.milestoneName
                ? ` | ${parents.milestoneName}`
                : '';
            let milestoneLabel = `=HYPERLINK("${milestoneGdFolderUrl}";"${parents.milestoneTypeFolderNumber} ${parents.milestoneTypeName}${milestoneNameCaption}")`;

            const parentCase = new Case({
                number: parents.caseNumber,
                _type: {},
                _parent: {
                    name: parents.milestoneName,
                    _type: {},
                } as MilestoneData,
            });
            const parentCaseDisplayNumber = parentCase.number
                ? ' | ' + parentCase._displayNumber
                : '';
            let contract_Number_Alias = parents.contractNumber;
            contract_Number_Alias += parents.contractAlias
                ? ' ' + parents.contractAlias
                : '';

            // Create case name as HYPERLINK formula when we have gd folder id
            const caseLabel =
                parents.caseGdFolderId && parents.caseName
                    ? `=HYPERLINK("${ToolsGd.createGdFolderUrl(
                          parents.caseGdFolderId
                      )}";"${parents.caseName}")`
                    : parents.caseName;

            const parentsData = [
                [
                    parents.projectId,
                    parents.contractId,
                    parents.contractOurId
                        ? parents.contractOurId
                        : parents.contractOurIdRelated, //dla kontrakty our bież dane z ourData, dla kontraktu na roboty bież dane z kolimny OurIdRelated
                    parents.milestoneId,
                    parents.caseTypeId,
                    task.caseId,
                    task.id,
                    task.ownerId ? task.ownerId : '',
                    '{"caseSynchronized":true,"taskSynchronized":true}',
                    !parents.contractOurId ? contract_Number_Alias : ' ',
                    milestoneLabel,
                    parents.caseTypeFolderNumber +
                        ' ' +
                        parents.caseTypeName +
                        parentCaseDisplayNumber,
                    caseLabel,
                    task.name,
                    task.deadline ? task.deadline : '',
                    '',
                    task.status,
                ],
            ];
            const projectIdColNumber =
                currentSprintValues[0].indexOf(
                    Setup.ScrumSheet.CurrentSprint.projectIdColName
                ) + 1;
            await ToolsSheets.updateValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: `${
                    Setup.ScrumSheet.CurrentSprint.name
                }!${ToolsSheets.R1C1toA1(
                    lastContractRow + 1,
                    projectIdColNumber
                )}`,
                values: parentsData,
            });

            await CurrentSprint.setSprintSumsInRows(auth, lastContractRow + 1);

            if (!isPartOfBatch) {
                //odtwórz #Times (ostatnie kolumny arkusza)
                await CurrentSprint.setSumInContractRow(auth, ourContractOurId);
                await CurrentSprint.sortContract(auth, ourContractOurId);
                console.log('tasks rows in contract sorted');
                if (lastContractRow < 13) {
                    await CurrentSprint.makeTimesSummary(auth);
                    console.log('times Summary table is rebuilt');
                }
            }
            return lastContractRow;
        } catch (err) {
            throw err;
        } finally {
            if (!externalConn) {
                conn.release();
                console.log('Task addInScrum conn released', conn.threadId);
            }
        }
    }

    /**
     * sprawdza czy zadanie powinno znaleźć się w arkuszu SCRUM
     * @param externalConn
     * @returns
     */
    static async shouldBeInScrum(
        task: Task,
        auth: OAuth2Client,
        externalConn?: mysql.PoolConnection
    ) {
        let test = false;
        const conn = externalConn
            ? externalConn
            : await ToolsDb.pool.getConnection();
        console.log('Task shouldBeInScrum conn', conn.threadId);
        try {
            if (task._owner && task._owner.id) {
                const systemRole = await PersonsController.getSystemRole({
                    id: task._owner.id,
                });
                if (!systemRole)
                    throw new Error('Użytkownik nie zarejestrowany w systemie');
                test =
                    task.status !== 'Backlog' &&
                    systemRole &&
                    systemRole.id <= 3;
            } else test = task.status !== 'Backlog';

            if (!test) return test;

            if (!task.caseId) {
                throw new Error(
                    'Task must have a caseId to be checked in Scrum.'
                );
            }
            const parents = await this.getParents(task.caseId, conn);
            const result = await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            });

            if (result && result.values && result.values.length > 0) {
                const currentSprintValues = result.values;
                const contractOurIdColNumber = currentSprintValues[0].indexOf(
                    Setup.ScrumSheet.CurrentSprint.contractOurIdColName
                );
                const ourContractOurId = parents.contractOurId
                    ? parents.contractOurId
                    : parents.contractOurIdRelated;
                const headerContractRow = Tools.findFirstInRange(
                    ourContractOurId,
                    currentSprintValues,
                    contractOurIdColNumber
                );
                if (!headerContractRow) test = false;
            } else {
                test = false;
            }
        } catch (error) {
            console.error('An error occurred:', error);
            test = false;
        } finally {
            if (!externalConn) {
                conn.release();
                console.log(
                    'conn released in task shouldBeInScrum',
                    conn.threadId
                );
            }
        }
        return test;
    }

    static async editInScrum(task: Task, auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;
        const taskNameColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskNameColName
            ) + 1;
        const taskIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.taskIdColName
        );
        const taskDataRow =
            <number>(
                Tools.findFirstInRange(
                    <number>task.id,
                    currentSprintValues,
                    taskIdColIndex
                )
            ) + 1;
        if (taskDataRow) {
            if (await this.shouldBeInScrum(task, auth)) {
                const taskData = [
                    [
                        task.name,
                        task.deadline ? task.deadline : '',
                        '',
                        task.status,
                        task._owner && task._owner.id
                            ? task._owner.name + ' ' + task._owner.surname
                            : '',
                    ],
                ];
                await ToolsSheets.updateValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: `${
                        Setup.ScrumSheet.CurrentSprint.name
                    }!${ToolsSheets.R1C1toA1(taskDataRow, taskNameColNumber)}`,
                    values: taskData,
                });
            } else await this.deleteFromScrum(task, auth);
        } else {
            //zmieniono status z 'Backlog' albo przypisano do pracownika ENVI
            await this.addInScrum(task, auth);
        }
    }

    static async deleteFromScrum(task: Task, auth: OAuth2Client) {
        CurrentSprint.deleteRowsByColValue(auth, {
            searchColName: Setup.ScrumSheet.CurrentSprint.taskIdColName,
            valueToFind: <number>task.id,
        });
    }
}
