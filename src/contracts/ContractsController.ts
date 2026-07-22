import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import BaseController from '../controllers/BaseController';
import Person from '../persons/Person';
import Project from '../projects/Project';
import CurrentSprint from '../ScrumSheet/CurrentSprint';
import CurrentSprintValidator from '../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import Setup from '../setup/Setup';
import Tools from '../tools/Tools';
import ToolsDb from '../tools/ToolsDb';
import ToolsSheets from '../tools/ToolsSheets';
import {
    CityData,
    ContractRangePerContractData,
    ContractTypeData,
} from '../types/types';
import Contract from './Contract';
import ProjectRepository from '../projects/ProjectRepository';
import ToolsGd from '../tools/ToolsGd';
import ContractEntityController from './ContractEntityController';
import ContractEntityRepository from './ContractEntityRepository';
import ContractOther from './ContractOther';
import ContractOur from './ContractOur';
import ContractRangeContractRepository from './contractRangesContracts/ContractRangeContractRepository';
import ContractRangesContractsController from './contractRangesContracts/ContractRangesController';
import ContractRepository from './ContractRepository';
import ContractType from './contractTypes/ContractType';
import Task from './milestones/cases/tasks/Task';
import TasksController from './milestones/cases/tasks/TasksController';
import Milestone from './milestones/Milestone';
import MilestonesController from './milestones/MilestonesController';
import MilestoneTemplatesController from './milestones/milestoneTemplates/MilestoneTemplatesController';
import {
    enqueueAqmPush,
    isAqmContractType,
    tryDeliverAfterCommit,
} from './aqmSync/AqmSync';
import {
    enqueueFidmanContractPush,
    isFidmanContractType,
    tryDeliverAfterCommit as tryDeliverFidmanAfterCommit,
} from './fidmanSync/FidmanSync';

export type ContractSearchParams = {
    id?: number;
    projectId?: number;
    projectOurId?: string;
    _project?: Project;
    searchText?: string;
    contractOurId?: string;
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    contractName?: string;
    contractAlias?: string;
    typeId?: number;
    _contractType?: ContractType;
    typesToInclude?: 'our' | 'other' | 'all';
    onlyOurs?: boolean; //@deprecated
    isArchived?: boolean;
    statuses?: string | string[];
    onlyKeyData?: boolean;
    getRemainingValue?: boolean;
    _admin?: Person;
    _manager?: Person;
    _contractRangesPerContract?: ContractRangePerContractData[];
};

export default class ContractsController extends BaseController<
    ContractOur | ContractOther,
    ContractRepository
> {
    private static instance: ContractsController;

    // Repository dla asocjacji
    private static rangeRepository = new ContractRangeContractRepository();

    constructor() {
        super(new ContractRepository());
    }

    // Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
    private static getInstance(): ContractsController {
        if (!this.instance) {
            this.instance = new ContractsController();
        }
        return this.instance;
    }

    static async find(orConditions: ContractSearchParams[] = []) {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * Tworzy instancję kontraktu z DTO
     */
    static async createContractFromDto(
        dto: any,
        isNew: boolean = false
    ): Promise<ContractOur | ContractOther> {
        if (typeof dto.value === 'string') {
            dto.value = parseFloat(
                dto.value.replace(/ /g, '').replace(',', '.')
            );
        }

        let contract: ContractOur | ContractOther;
        if (dto._type?.isOur || dto.ourId) {
            let ourId = dto.ourId;
            if (isNew && !ourId) {
                ourId = await this.makeOurId(
                    dto._city as CityData,
                    dto._type as ContractTypeData
                );
            }
            contract = new ContractOur({ ...dto, ourId });
        } else {
            contract = new ContractOther(dto);
        }

        if (isNew && (!contract._project || !contract._project.id)) {
            throw new Error('Nie przypisano projektu do kontraktu');
        }
        return contract;
    }

    /**
     * Dodaje nowy kontrakt do bazy danych
     * REFAKTORING: Przeniesione z Contract.addInDb() i Contract.addNewController()
     *
     * @param contract - instancja ContractOur lub ContractOther
     * @param auth - OAuth2Client (opcjonalny - jeśli null, operacje GD/Scrum będą pominięte)
     * @param taskId - ID zadania dla TaskStore (opcjonalny - dla progress tracking)
     * @returns Zaktualizowany kontrakt z ID z bazy danych
     */
    static async add(
        contract: ContractOur | ContractOther,
        auth?: OAuth2Client,
        taskId?: string
    ): Promise<ContractOur | ContractOther> {
        const instance = this.getInstance();

        this.ensureAliasPresent(contract);

        // Walidacja biznesowa
        if (await instance.repository.isUniquePerProject(contract)) {
            // Twórz komunikat błędu bez wywoływania protected metody
            const contractInfo =
                contract instanceof ContractOur
                    ? `OurId: ${contract.ourId}`
                    : `Number/Alias: ${contract.number || contract.alias}`;
            throw new Error(
                `Contract with ${contractInfo} already exists in this project`
            );
        }
        if (!contract.startDate || !contract.endDate) {
            throw new Error('Start date or end date is not set');
        }

        // Walidacja arkusza Scrum (tylko jeśli auth dostępne)
        if (auth) {
            await CurrentSprintValidator.checkColumns(auth);
        }

        try {
            console.group(`Creating a new Contract ${contract.id}`);

            // Operacje Google Drive (jeśli auth dostępne)
            if (auth) {
                if (taskId) TaskStore.update(taskId, 'Tworzę foldery', 4);
                await contract.createFolders(auth);
                console.log('Contract folders created');
            }

            // Operacje bazodanowe - TRANSAKCJA
            if (taskId) TaskStore.update(taskId, 'Zapisuję w bazie danych', 15);
            let aqmOutboxId: number | undefined;
            let fidmanOutboxId: number | undefined;
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                // 1. Dodaj główny rekord Contract (i OurContractsData jeśli dotyczy)
                await instance.repository.addInDb(contract, conn, true);

                // 2. Dodaj asocjacje Entity (CONTRACTOR, ENGINEER, EMPLOYER)
                await ContractEntityController.addAssociations(contract, conn);

                // 3. Dodaj asocjacje ContractRange
                if (contract._contractRangesPerContract?.length) {
                    await this.rangeRepository.addAssociations(
                        contract,
                        contract._contractRangesPerContract,
                        conn
                    );
                }

                // 4. WS10: jeśli typ „AQM" → wpis outbox w TEJ SAMEJ transakcji (L8)
                if (isAqmContractType(contract.typeId)) {
                    aqmOutboxId = await enqueueAqmPush(contract, conn);
                }

                // 5. SYNC-P1: jeśli typ FIDman (3/4) → wpis outbox w TEJ SAMEJ
                // transakcji (L8). Osobna tabela, ta sama gwarancja atomowości.
                if (isFidmanContractType(contract.typeId)) {
                    fidmanOutboxId = await enqueueFidmanContractPush(
                        contract,
                        conn
                    );
                }
            });
            console.log('Contract added in db');

            // WS10: push do AQM STRICTLY post-commit; awaria nigdy nie rolbackuje
            // ani nie wychodzi z transakcji umowy (L8). Defense-in-depth: nawet
            // gdyby tryDeliverAfterCommit kiedyś rzuciło, .catch() izoluje umowę.
            if (aqmOutboxId !== undefined) {
                await tryDeliverAfterCommit(aqmOutboxId).catch((err) =>
                    console.error('[AqmSync] post-commit push (add) error:', err)
                );
            }
            if (fidmanOutboxId !== undefined) {
                await tryDeliverFidmanAfterCommit(fidmanOutboxId).catch((err) =>
                    console.error(
                        '[FidmanSync] post-commit push (add) error:',
                        err
                    )
                );
            }

            // Operacje Scrum (jeśli auth dostępne)
            if (auth) {
                if (taskId) TaskStore.update(taskId, 'Dodaję do scrum', 22);
                await contract.addInScrum(auth);
                console.log('Contract added in scrum');

                // Kamienie milowe
                console.group('Creating default milestones');
                if (taskId)
                    TaskStore.update(taskId, 'Tworzę kamienie milowe', 45);
                await ContractsController.createDefaultMilestones(
                    contract,
                    auth,
                    taskId || ''
                );
                console.log('Default milestones, cases & tasks created');
                console.groupEnd();
            }

            console.log(`Contract ${contract._ourIdOrNumber_Alias} created`);
            console.groupEnd();

            return contract;
        } catch (error) {
            console.group('Error while creating contract');

            // Rollback operacji zewnętrznych
            if (auth) {
                contract
                    .deleteFolder(auth)
                    .then(() => console.log('folders deleted'));
                contract
                    .deleteFromScrum(auth)
                    .then(() => console.log('deleted from scrum'));
            }

            // Rollback bazy danych (jeśli ID zostało przypisane)
            if (contract.id) {
                instance.repository
                    .deleteFromDb(contract)
                    .then(() => console.log('deleted from db'));
            }

            console.groupEnd();
            throw error;
        }
    }

    /**
     * Public wrapper dla dodawania kontraktu z automatyczną autoryzacją
     * Używany w Router gdy auth musi być pobrany z session
     *
     * @param contract - instancja ContractOur lub ContractOther
     * @param taskId - ID zadania dla TaskStore (opcjonalny)
     * @returns Zaktualizowany kontrakt z ID z bazy danych
     */
    static async addWithAuth(
        contract: ContractOur | ContractOther,
        taskId?: string
    ): Promise<ContractOur | ContractOther> {
        return await this.withAuth(async (instance, auth) => {
            return await this.add(contract, auth, taskId);
        });
    }

    /**
     * Edytuje istniejący kontrakt
     * REFAKTORING: Przeniesione z Contract.editInDb() i Contract.editHandler()
     *
     * @param contract - instancja ContractOur lub ContractOther z nowymi danymi
     * @param auth - OAuth2Client (opcjonalny - jeśli null, operacje GD/Scrum będą pominięte)
     * @param fieldsToUpdate - opcjonalna lista pól do aktualizacji (jeśli undefined, wszystkie pola)
     * @returns Zaktualizowany kontrakt
     */
    static async edit(
        contract: ContractOur | ContractOther,
        auth?: OAuth2Client,
        fieldsToUpdate?: string[]
    ): Promise<ContractOur | ContractOther> {
        const instance = this.getInstance();

        console.group(`Editing contract ${contract._ourIdOrNumber_Name}`);

        try {
            this.ensureAliasPresent(contract, fieldsToUpdate);

            // Lista pól które wymagają tylko update DB (bez GD/Scrum)
            const onlyDbFields = [
                'status',
                'comment',
                'startDate',
                'endDate',
                'guaranteeEndDate',
                'value',
                'name',
            ];

            // Sprawdź czy to tylko pola DB
            const isOnlyDbFields =
                fieldsToUpdate &&
                fieldsToUpdate.length > 0 &&
                fieldsToUpdate.every((field) => onlyDbFields.includes(field));

            // Operacje Google Drive i Scrum (jeśli auth i NIE tylko pola DB)
            if (auth && !isOnlyDbFields) {
                const [, wasAddedToScrum] = await Promise.all([
                    contract
                        .editFolder(auth)
                        .then(() => console.log('Contract folder edited')),
                    contract.editInScrum(auth).then((added) => {
                        console.log('Contract edited in scrum');
                        return added;
                    }),
                ]);

                // Utwórz folder „Dokumentacja zatwierdzona” w istniejących kamieniach
                // projektowanie-nadzór kontraktu. Pomijamy przy edycji częściowej,
                // która nie dotyka flagi (get-or-create i tak jest idempotentne).
                const approvedDocsInScope =
                    !fieldsToUpdate ||
                    fieldsToUpdate.includes('approvedDocumentation');
                if (approvedDocsInScope) {
                    await MilestonesController.ensureApprovedDocsFolders(
                        contract,
                        auth
                    );
                }

                // Jeśli kontrakt był dodawany na nowo do Scrum, dodaj tasks
                if (wasAddedToScrum) {
                    await this.addExistingTasksInScrum(contract, auth);

                    // Post-processing Scrum dla ContractOur
                    if (contract instanceof ContractOur) {
                        await CurrentSprint.setSumInContractRow(
                            auth,
                            contract.ourId
                        );
                        await CurrentSprint.sortContract(auth, contract.ourId);
                        await CurrentSprint.makeTimesSummary(auth);
                        await CurrentSprint.makePersonTimePerTaskFormulas(auth);
                    }
                    // Post-processing Scrum dla ContractOther
                    else if (
                        contract instanceof ContractOther &&
                        contract.ourIdRelated
                    ) {
                        // Sprawdź pozycję macierzystej umowy ENVI
                        const currentSprintValues = <any[][]>(
                            await ToolsSheets.getValues(auth, {
                                spreadsheetId: Setup.ScrumSheet.GdId,
                                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                            })
                        ).values;
                        const contractOurIdColIndex =
                            currentSprintValues[0].indexOf(
                                Setup.ScrumSheet.CurrentSprint
                                    .contractOurIdColName
                            );
                        const firstRowNumber =
                            <number>(
                                Tools.findFirstInRange(
                                    contract.ourIdRelated,
                                    currentSprintValues,
                                    contractOurIdColIndex
                                )
                            ) + 1;

                        await CurrentSprint.setSumInContractRow(
                            auth,
                            contract.ourIdRelated
                        );
                        await CurrentSprint.sortContract(
                            auth,
                            contract.ourIdRelated
                        );
                        if (firstRowNumber < 13) {
                            await CurrentSprint.makeTimesSummary(auth);
                            await CurrentSprint.makePersonTimePerTaskFormulas(
                                auth
                            );
                        }
                    }
                }
            }

            // Operacje bazodanowe - TRANSAKCJA
            let aqmOutboxId: number | undefined;
            let fidmanOutboxId: number | undefined;
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                // 1. Update tabeli Contracts (i OurContractsData jeśli dotyczy)
                await instance.repository.editInDb(
                    contract,
                    conn,
                    true,
                    fieldsToUpdate
                );

                // 2. Update asocjacji Entity
                const entityKeys = ['_employers', '_engineers', '_contractors'];
                const anyEntityToUpdate =
                    !fieldsToUpdate ||
                    entityKeys.some((key) => fieldsToUpdate.includes(key));

                if (anyEntityToUpdate) {
                    console.log('Edytuję powiązania z podmiotami');
                    await ContractEntityController.editAssociations(
                        contract,
                        conn
                    );
                }

                // 3. Update asocjacji ContractRange
                if (
                    (!fieldsToUpdate ||
                        fieldsToUpdate.includes(
                            '_contractRangesPerContract'
                        )) &&
                    contract._contractRangesPerContract
                ) {
                    console.log('Edytuję powiązania z zakresami');
                    await this.rangeRepository.editAssociations(
                        contract,
                        contract._contractRangesPerContract,
                        conn
                    );
                }

                // 4. WS10: jeśli typ „AQM" → wpis outbox w TEJ SAMEJ transakcji (L8)
                if (isAqmContractType(contract.typeId)) {
                    aqmOutboxId = await enqueueAqmPush(contract, conn);
                }

                // 5. SYNC-P1: jeśli typ FIDman (3/4) → wpis outbox w TEJ SAMEJ
                // transakcji (L8). Osobna tabela, ta sama gwarancja atomowości.
                if (isFidmanContractType(contract.typeId)) {
                    fidmanOutboxId = await enqueueFidmanContractPush(
                        contract,
                        conn
                    );
                }
            });

            console.log('Contract edited in db');

            // WS10: push do AQM STRICTLY post-commit; awaria nigdy nie rolbackuje
            // ani nie wychodzi z transakcji umowy (L8). Defense-in-depth: nawet
            // gdyby tryDeliverAfterCommit kiedyś rzuciło, .catch() izoluje umowę.
            if (aqmOutboxId !== undefined) {
                await tryDeliverAfterCommit(aqmOutboxId).catch((err) =>
                    console.error(
                        '[AqmSync] post-commit push (edit) error:',
                        err
                    )
                );
            }
            if (fidmanOutboxId !== undefined) {
                await tryDeliverFidmanAfterCommit(fidmanOutboxId).catch((err) =>
                    console.error(
                        '[FidmanSync] post-commit push (edit) error:',
                        err
                    )
                );
            }

            console.groupEnd();

            return contract;
        } catch (error) {
            console.groupEnd();
            throw error;
        }
    }

    /**
     * Public wrapper dla edycji kontraktu z automatyczną autoryzacją
     * Używany w Router gdy auth musi być pobrany z session
     *
     * @param contract - instancja ContractOur lub ContractOther z nowymi danymi
     * @param fieldsToUpdate - opcjonalna lista pól do aktualizacji
     * @returns Zaktualizowany kontrakt
     */
    static async editWithAuth(
        contract: ContractOur | ContractOther,
        fieldsToUpdate?: string[]
    ): Promise<ContractOur | ContractOther> {
        return await this.withAuth(async (instance, auth) => {
            return await this.edit(contract, auth, fieldsToUpdate);
        });
    }

    private static ensureAliasPresent(
        contract: ContractOur | ContractOther,
        fieldsToUpdate?: string[]
    ): void {
        const shouldValidateAlias =
            !fieldsToUpdate || fieldsToUpdate.includes('alias');

        if (!shouldValidateAlias) {
            return;
        }

        if (!contract.alias || !contract.alias.trim()) {
            throw new Error('Alias jest wymagany');
        }
    }

    /**
     * Usuwa kontrakt z bazy danych, Google Drive i Scrum
     * REFAKTORING: Ujednolicona logika DELETE dla ContractOur i ContractOther
     *
     * @param contract - instancja ContractOur lub ContractOther do usunięcia
     * @param auth - OAuth2Client (opcjonalny - jeśli null, operacje GD/Scrum będą pominięte)
     * @returns Usunięty kontrakt
     */
    static async delete(
        contract: ContractOur | ContractOther,
        auth?: OAuth2Client
    ): Promise<ContractOur | ContractOther> {
        const instance = this.getInstance();

        console.group(`Deleting contract ${contract._ourIdOrNumber_Name}`);

        try {
            // 1. Usunięcie z bazy danych - TRANSAKCJA
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                // Usuń asocjacje Entity
                await ContractEntityController.deleteAssociations(
                    contract.id!,
                    conn
                );
                console.log('Contract entities associations deleted');

                // Usuń asocjacje ContractRange
                await this.rangeRepository.deleteByContractId(
                    contract.id!,
                    conn
                );
                console.log('Contract ranges associations deleted');

                // Usuń z tabeli Contracts (i OurContractsData)
                await instance.repository.deleteFromDb(contract, conn, true);
                console.log('Contract deleted from Contracts table');
            });

            // 2. Operacje Google Drive i Scrum (jeśli auth dostępne)
            if (auth) {
                await Promise.all([
                    contract
                        .deleteFolder(auth)
                        .then(() =>
                            console.log('Contract folder deleted from GD')
                        ),
                    contract
                        .deleteFromScrum(auth)
                        .then(() => console.log('Contract deleted from Scrum')),
                ]);
            }

            console.log(`Contract ${contract.name} deleted`);
            console.groupEnd();

            return contract;
        } catch (error) {
            console.groupEnd();
            throw error;
        }
    }

    /**
     * Public wrapper dla usunięcia kontraktu z automatyczną autoryzacją
     * Używany w Router gdy auth musi być pobrany z session
     *
     * @param contract - instancja ContractOur lub ContractOther do usunięcia
     * @returns Usunięty kontrakt
     */
    static async deleteWithAuth(
        contract: ContractOur | ContractOther
    ): Promise<ContractOur | ContractOther> {
        return await this.withAuth(async (instance, auth) => {
            return await this.delete(contract, auth);
        });
    }

    /**
     * Przenosi ContractOur (wraz z powiązanymi ContractOther) do innego projektu.
     *
     * Kolejność operacji:
     * 1. GD: przenieś folder ContractOur → nowy projekt (foldery ContractOther i kamieni przenoszą się automatycznie)
     * 2. DB: zmień ProjectOurId dla ContractOur i wszystkich ContractOther (OurIdRelated = ourId)
     * 3. Scrum: zaktualizuj nagłówek kontraktu (nowe projectOurId + sortProjects)
     *
     * Na błąd DB po udanym GD: cofamy przeniesienie folderu.
     */
    static async moveToProject(
        contractId: number,
        newProjectOurId: string,
        auth: OAuth2Client
    ): Promise<ContractOur> {
        const contracts = await this.find([
            { id: contractId, typesToInclude: 'our' },
        ]);
        if (!contracts.length)
            throw new Error(`ContractOur o id=${contractId} nie znaleziono`);
        const contractOur = contracts[0] as ContractOur;
        if (!contractOur.gdFolderId)
            throw new Error('ContractOur nie ma gdFolderId');

        const oldProjectOurId = contractOur.projectOurId;
        if (oldProjectOurId === newProjectOurId)
            throw new Error('Kontrakt już jest przypisany do tego projektu');

        const projectRepo = new ProjectRepository();
        const [oldProjects, newProjects] = await Promise.all([
            projectRepo.find([{ ourId: oldProjectOurId }]),
            projectRepo.find([{ ourId: newProjectOurId }]),
        ]);
        if (!oldProjects.length)
            throw new Error(`Stary projekt ${oldProjectOurId} nie znaleziono`);
        if (!newProjects.length)
            throw new Error(`Nowy projekt ${newProjectOurId} nie znaleziono`);
        const oldProject = oldProjects[0];
        const newProject = newProjects[0];
        if (!oldProject.gdFolderId)
            throw new Error('Stary projekt nie ma gdFolderId');
        if (!newProject.gdFolderId)
            throw new Error('Nowy projekt nie ma gdFolderId');

        // GD najpierw — na błąd GD nie zmieniamy DB
        await ToolsGd.moveFileOrFolder(
            auth,
            { id: contractOur.gdFolderId, parents: [oldProject.gdFolderId] },
            newProject.gdFolderId
        );

        try {
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await conn.execute(
                    `UPDATE Contracts SET ProjectOurId = ? WHERE Id = ?`,
                    [newProjectOurId, contractOur.id]
                );
                await conn.execute(
                    `UPDATE Contracts SET ProjectOurId = ? WHERE OurIdRelated = ?`,
                    [newProjectOurId, contractOur.ourId]
                );
            });
        } catch (err) {
            // Rollback GD — cofnij przeniesienie folderu
            await ToolsGd.moveFileOrFolder(
                auth,
                { id: contractOur.gdFolderId, parents: [newProject.gdFolderId] },
                oldProject.gdFolderId
            ).catch((gdErr) =>
                console.error('Nie udało się cofnąć przeniesienia GD:', gdErr)
            );
            throw err;
        }

        contractOur.projectOurId = newProjectOurId;
        contractOur._project = newProject;
        contractOur._gdFolderUrl = ToolsGd.createGdFolderUrl(
            contractOur.gdFolderId
        );
        await contractOur
            .editInScrum(auth)
            .catch((err) =>
                console.error(
                    'Błąd aktualizacji Scrum po przeniesieniu kontraktu:',
                    err
                )
            );

        return contractOur;
    }

    static async moveToProjectWithAuth(
        contractId: number,
        newProjectOurId: string
    ): Promise<ContractOur> {
        return await this.withAuth(async (_instance, auth) => {
            return await ContractsController.moveToProject(
                contractId,
                newProjectOurId,
                auth
            );
        });
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '';
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(mainContracts.Name LIKE ?
                OR mainContracts.Number LIKE ?
                OR mainContracts.Alias LIKE ?
                OR OurContractsData.OurId LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: ContractSearchParams) {
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectOurId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;
        const isArchived = typeof searchParams.isArchived === 'string';

        const conditions: string[] = [];

        if (searchParams.id) {
            conditions.push(
                mysql.format(`mainContracts.Id = ?`, [searchParams.id])
            );
        }
        if (searchParams.projectId) {
            conditions.push(
                mysql.format(`Projects.Id = ?`, [searchParams.projectId])
            );
        }
        if (projectOurId) {
            conditions.push(
                mysql.format(`mainContracts.ProjectOurId = ?`, [projectOurId])
            );
        }
        if (searchParams.contractOurId) {
            conditions.push(
                mysql.format(`OurContractsData.OurId LIKE ?`, [
                    `%${searchParams.contractOurId}%`,
                ])
            );
        }
        if (searchParams.contractName) {
            conditions.push(
                mysql.format(`mainContracts.Name = ?`, [
                    searchParams.contractName,
                ])
            );
        }
        if (searchParams.startDateFrom) {
            conditions.push(
                mysql.format(`mainContracts.StartDate >= ?`, [
                    searchParams.startDateFrom,
                ])
            );
        }
        if (searchParams.startDateTo) {
            conditions.push(
                mysql.format(`mainContracts.StartDate <= ?`, [
                    searchParams.startDateTo,
                ])
            );
        }
        if (searchParams.endDateFrom) {
            conditions.push(
                mysql.format(`mainContracts.EndDate >= ?`, [
                    searchParams.endDateFrom,
                ])
            );
        }
        if (searchParams.endDateTo) {
            conditions.push(
                mysql.format(`mainContracts.EndDate <= ?`, [
                    searchParams.endDateTo,
                ])
            );
        }
        if (typeId) {
            conditions.push(mysql.format(`mainContracts.TypeId = ?`, [typeId]));
        }

        if (searchParams.statuses?.length) {
            const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(
                searchParams.statuses,
                'mainContracts',
                'Status'
            );
            conditions.push(statusCondition);
        }
        if (searchParams._contractRangesPerContract?.length) {
            const contractRangesCondition =
                ToolsDb.makeOrConditionFromValueOrArray(
                    searchParams._contractRangesPerContract?.map(
                        (range) => range._contractRange.id
                    ),
                    'ContractRangesContracts',
                    'ContractRangeId'
                );
            conditions.push(contractRangesCondition);
        }

        const adminId = searchParams._admin?.id;
        if (adminId) {
            conditions.push(
                mysql.format(
                    `(OurContractsData.AdminId = ? OR RelatedOurContractsData.AdminId = ?)`,
                    [adminId, adminId]
                )
            );
        }

        switch (searchParams.typesToInclude) {
            case 'our':
                conditions.push('OurContractsData.OurId IS NOT NULL');
                break;
            case 'other':
                conditions.push('OurContractsData.OurId IS NULL');
                break;
            default:
                // Default case does not add a condition
                break;
        }

        if (searchParams.onlyOurs) {
            conditions.push('OurContractsData.OurId IS NOT NULL');
        }

        if (isArchived) {
            conditions.push(
                `mainContracts.Status = ${Setup.ContractStatus.ARCHIVAL}`
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition) {
            conditions.push(searchTextCondition);
        }

        // Return the combined conditions or default to '1' if empty
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private static async processContractsResult(
        result: any[],
        initParamObject: ContractSearchParams
    ) {
        const newResult: (ContractOur | ContractOther)[] = [];
        let entitiesPerProject: any[] = [];
        let rangesPerContract: ContractRangePerContractData[] = [];
        //wybrano widok szczegółowy dla projketu lub kontraktu
        if (initParamObject.projectOurId || initParamObject.id) {
            entitiesPerProject = await this.getContractEntityAssociationsList({
                projectId: initParamObject.projectOurId,
                contractId: initParamObject.id,
                isArchived: initParamObject.isArchived,
            });
            rangesPerContract =
                await ContractRangesContractsController.getContractRangesContractsList(
                    [
                        {
                            contractId: initParamObject.id,
                        },
                    ]
                );
        }
        for (const row of result) {
            const contractors = entitiesPerProject.filter(
                (item: any) =>
                    item._contract.id == row.Id &&
                    item.contractRole == 'CONTRACTOR'
            );
            const engineers = entitiesPerProject.filter(
                (item: any) =>
                    item._contract.id == row.Id &&
                    item.contractRole == 'ENGINEER'
            );
            const employers = entitiesPerProject.filter(
                (item: any) =>
                    item._contract.id == row.Id &&
                    item.contractRole == 'EMPLOYER'
            );

            const _city: CityData | undefined = row.CityId
                ? {
                      id: row.CityId,
                      name: row.CityName,
                      code: row.CityCode,
                  }
                : undefined;

            const initParam = {
                id: row.Id,
                alias: row.Alias,
                number: row.Number,
                name: ToolsDb.sqlToString(row.Name),
                _city,
                //kontrakt powiązany z kontraktem na roboty
                _ourContract: {
                    ourId: row.OurIdRelated,
                    id: row.RelatedId,
                    name: ToolsDb.sqlToString(row.RelatedName),
                    gdFolderId: row.RelatedGdFolderId,
                },
                _project: {
                    id: row.ProjectId,
                    ourId: row.ProjectOurId,
                    name: row.ProjectName,
                    alias: row.ProjectAlias,
                    gdFolderId: row.ProjectGdFolderId,
                },
                startDate: row.StartDate,
                endDate: row.EndDate,
                guaranteeEndDate: row.GuaranteeEndDate,
                value: row.Value,
                _remainingNotScheduledValue: row.RemainingNotScheduledValue,
                _remainingNotIssuedValue: row.RemainingNotIssuedValue,
                comment: ToolsDb.sqlToString(row.Comment),
                status: row.Status,
                gdFolderId: row.GdFolderId,
                meetingProtocolsGdFolderId: row.MeetingProtocolsGdFolderId,
                materialCardsGdFolderId: row.MaterialCardsGdFolderId,
                ourId: row.OurId,
                _manager: {
                    id: row.ManagerId,
                    name: row.ManagerName,
                    surname: row.ManagerSurname,
                    email: row.ManagerEmail,
                },
                _admin: {
                    id: row.AdminId,
                    name: row.AdminName,
                    surname: row.AdminSurname,
                    email: row.AdminEmail,
                },
                _type: new ContractType({
                    id: row.MainContractTypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                    isOur: row.TypeIsOur,
                }),
                _contractors: contractors.map((item) => item._entity),
                _engineers: engineers.map((item) => item._entity),
                _employers: employers.map((item) => item._entity),
                _contractRangesPerContract: rangesPerContract,
                _contractRangesNames: row.ContractRangesNames
                    ? row.ContractRangesNames.split(', ')
                    : undefined,
                _lastUpdated: row.LastUpdated,
            };
            let item: ContractOur | ContractOther;
            try {
                item = row.TypeIsOur
                    ? new ContractOur(initParam)
                    : new ContractOther(initParam);
            } catch (err) {
                console.log(initParam);
                throw err;
            }
            newResult.push(item);
        }
        return newResult;
    }
    /** @deprecated
     * @todo: do usunięcia po fazie migracji
     */
    private static processContractsResultKeyData(
        result: any[],
        initParamObject: any
    ) {
        const newResult: (ContractOur | ContractOther)[] = [];

        for (const row of result) {
            const initParam = {
                id: row.Id,
                alias: row.Alias,
                number: row.Number,
                name: ToolsDb.sqlToString(row.Name),
                //kontrakt powiązany z kontraktem na roboty
                _ourContract: {
                    ourId: row.OurIdRelated,
                    id: row.RelatedId,
                    name: ToolsDb.sqlToString(row.RelatedName),
                    gdFolderId: row.RelatedGdFolderId,
                },
                projectId: row.ProjectOurId,
                startDate: row.StartDate,
                endDate: row.EndDate,
                guaranteeEndDate: row.GuaranteeEndDate,
                value: row.Value,
                comment: ToolsDb.sqlToString(row.Comment),
                status: row.Status,
                gdFolderId: row.GdFolderId,
                meetingProtocolsGdFolderId: row.MeetingProtocolsGdFolderId,
                materialCardsGdFolderId: row.MaterialCardsGdFolderId,
                ourId: row.OurId,
                _manager: {
                    id: row.ManagerId,
                    name: row.ManagerName,
                    surname: row.ManagerSurname,
                    email: row.ManagerEmail,
                },
                _admin: {
                    id: row.AdminId,
                    name: row.AdminName,
                    surname: row.AdminSurname,
                    email: row.AdminEmail,
                },
                _type: {
                    id: row.TypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                    isOur: row.TypeIsOur,
                },
            };
            const item = row.TypeIsOur
                ? new ContractOur(initParam)
                : new ContractOther(initParam);

            newResult.push(item);
        }
        return newResult;
    }

    static async getContractEntityAssociationsList(initParamObject: {
        projectId?: string;
        contractId?: number;
        isArchived?: boolean;
    }) {
        const associations = await ContractEntityController.find({
            projectId: initParamObject.projectId,
            contractId: initParamObject.contractId,
        });

        // Konwertuj do starego formatu dla kompatybilności
        return associations.map((assoc) => ({
            contractRole: assoc.contractRole,
            _contract: assoc._contract,
            _entity: assoc._entity,
        }));
    }

    static async makeOurId(city: CityData, type: ContractTypeData) {
        if (!city) throw new Error('Nie można utworzyć OurId - brak miasta');
        if (!city.code)
            throw new Error('Nie można utworzyć OurId - brak kodu miasta');
        if (!type)
            throw new Error('Nie można utworzyć OurId - brak typu kontraktu');
        if (!type.name)
            throw new Error(
                'Nie można utworzyć OurId - brak nazwy typu kontraktu'
            );

        const itemsCount = Tools.addZero(await this.getItemsCount(city, type));
        return `${city.code}.${type.name}.${itemsCount}`;
    }

    private static async getItemsCount(city: CityData, type: ContractTypeData) {
        const typeCondition = mysql.format(`ContractTypes.Id = ?`, [type.id]);
        //const typeCondition = `SUBSTRING_INDEX(SUBSTRING_INDEX(OurContractsData.OurId, '.', 2), '.', -1) = ${mysql.escape(
        //    type.name
        //)}`;
        const cityCondition = mysql.format(`OurContractsData.CityId = ?`, [
            city.id,
        ]);

        const sql = this.getPrevNumberSQL(typeCondition, cityCondition);

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            const row = result[0];
            const itemsCount = row.Number as number;
            //console.log('@@@@@itemsCount', itemsCount);
            return itemsCount + 1;
        } catch (err) {
            throw err;
        }
    }

    private static getPrevNumberSQL(
        typeCondition: string,
        cityCondition: string
    ) {
        const sql = `SELECT MAX(CAST(SUBSTRING(OurContractsData.OurId, LENGTH(OurId) - 1, 2) AS UNSIGNED)) AS Number
            FROM Contracts
            JOIN ContractTypes ON Contracts.TypeId = ContractTypes.Id
            JOIN OurContractsData ON Contracts.Id = OurContractsData.Id
            WHERE  ${typeCondition} AND ${cityCondition}`;
        return sql;
    }

    /**
     * Tworzy domyślne milestones dla kontraktu
     * Przeniesione z Contract.ts - Controller może orkiestrować inne Controllers
     */
    static async createDefaultMilestones(
        contract: Contract,
        auth: OAuth2Client,
        taskId: string
    ): Promise<Milestone[]> {
        const defaultMilestones: Milestone[] = [];
        const sessionTask = TaskStore.get(taskId);

        const defaultMilestoneTemplates =
            await MilestoneTemplatesController.find(
                {
                    isDefaultOnly: true,
                    contractTypeId: contract.typeId,
                },
                'CONTRACT'
            );

        for (let i = 0; i < defaultMilestoneTemplates.length; i++) {
            const template = defaultMilestoneTemplates[i];
            const startPercent = sessionTask?.percent || 0;
            const endPercent = 90;
            const step =
                (endPercent - startPercent) / defaultMilestoneTemplates.length;
            const percent = startPercent + step * i;
            const milestone = new Milestone({
                name: template.name,
                description: template.description,
                _type: template._milestoneType,
                _contract: contract as any,
                status: 'Nie rozpoczęty',
                _dates: [
                    {
                        startDate: contract.startDate!,
                        endDate: contract.endDate!,
                        milestoneId: 0, //will be set in Milestone addInDb()
                    },
                ],
            });

            TaskStore.update(
                taskId,
                `Tworzę kamień milowy ${milestone._FolderNumber_TypeName_Name}`,
                percent
            );
            //zasymuluj numer kamienia nieunikalnego.
            //UWAGA: założenie, że przy dodawaniu kamieni domyślnych nie będzie więcej niż jeden tego samego typu
            if (!milestone._type.isUniquePerContract) {
                milestone.number = 1;
            }
            await MilestonesController.createFolders(milestone, auth);
            defaultMilestones.push(milestone);
        }
        console.log('Milestones folders created');

        // Zapisz Milestones do DB i utwórz Cases z Tasks (spójna struktura)
        await MilestonesController.addBulkWithDatesAndCases(
            defaultMilestones,
            auth,
            { isPartOfBatch: true }
        );
        console.log('Milestones with Cases and Tasks created');

        // Post-processing dla ContractOur i ContractOther (logika Scrum)
        if (
            Setup.scrumSheetSyncEnabled &&
            contract instanceof ContractOur &&
            (await contract.shouldBeInScrum())
        ) {
            TaskStore.update(taskId, 'Ostatnie porządki w scrum', 95);
            await CurrentSprint.setSumInContractRow(auth, contract.ourId).catch(
                (err: any) => {
                    console.log('Błąd przy dodawaniu sumy w kontrakcie', err);
                    throw new Error(
                        'Błąd przy liczeniu sumy w nagłówku kontraktu przy dodawaniu do scruma \n' +
                            err.message
                    );
                }
            );

            await CurrentSprint.sortContract(auth, contract.ourId).catch(
                (err: any) => {
                    console.log('Błąd przy sortowaniu kontraktu', err);
                    throw new Error(
                        'Błąd przy sortowaniu kontraktów w scrumie po dodaniu kamieni \n' +
                            err.message
                    );
                }
            );

            await CurrentSprint.makeTimesSummary(auth).catch((err: any) => {
                console.log('Błąd przy tworzeniu sumy czasów', err);
                throw new Error(
                    'Błąd przy dodawaniu do scruma podczas tworzeniu sumy czasów pracy \n' +
                        err.message
                );
            });
            await CurrentSprint.makePersonTimePerTaskFormulas(auth);
        } else if (
            Setup.scrumSheetSyncEnabled &&
            contract instanceof ContractOther &&
            contract.ourIdRelated
        ) {
            TaskStore.update(taskId, 'Ostatnie porządki w scrum', 95);
            await CurrentSprint.setSumInContractRow(
                auth,
                contract.ourIdRelated
            );
            await CurrentSprint.sortContract(auth, contract.ourIdRelated);
            await CurrentSprint.makeTimesSummary(auth);
            await CurrentSprint.makePersonTimePerTaskFormulas(auth);
        }

        return defaultMilestones;
    }

    /**
     * Dodaje domyślne milestones do bazy danych
     * Przeniesione z Contract.ts
     */
    private static async addDefaultMilestonesInDb(
        milestones: Milestone[],
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<void> {
        await MilestonesController.addBulkWithDates(milestones, externalConn);
    }

    /**
     * Pobiera tasks dla kontraktu
     * Przeniesione z Contract.ts
     */
    static async getContractTasks(contractId: number): Promise<Task[]> {
        return await TasksController.find([{ contractId }]);
    }

    /**
     * Dodaje istniejące zadania kontraktu do Scrum
     * Przeniesione z Contract.ts
     */
    static async addExistingTasksInScrum(
        contract: Contract,
        auth: OAuth2Client
    ): Promise<void> {
        let conn: mysql.PoolConnection | null = null;
        try {
            const tasks = await this.getContractTasks(contract.id!);
            console.log(`adding ${tasks.length} tasks in scrum`);
            conn = await ToolsDb.pool.getConnection();
            for (const task of tasks) {
                await TasksController.addInScrum(task, auth, conn, true);
            }
        } catch (error) {
            console.error('An error occurred:', error);
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }
}
