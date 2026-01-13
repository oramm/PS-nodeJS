import BaseRepository from '../../../repositories/BaseRepository';
import Case from './Case';
import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import ProcessesController from '../../../processes/ProcesesController';
import ProcessInstancesController from '../../../processes/processInstances/ProcessInstancesController';
import Risk from './risks/Risk';
import Milestone from '../Milestone';
import ContractOur from '../../ContractOur';
import ContractOther from '../../ContractOther';
import { OfferData } from '../../../types/types';
import TaskRepository from './tasks/TaskRepository';

export type CasesSearchParams = {
    projectId?: string;
    contractId?: number;
    _contract?: any;
    _offer?: any;
    offerId?: number;
    milestoneId?: number;
    caseId?: number;
    typeId?: number;
    milestoneTypeId?: number;
    searchText?: string;
    hasProcesses?: string;
};

/**
 * Repository dla Case - warstwa dostępu do danych
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseRepository<Case>
 * - Odpowiedzialny TYLKO za operacje CRUD i SQL
 * - NIE zawiera logiki biznesowej
 */
export default class CaseRepository extends BaseRepository<Case> {
    constructor() {
        super('Cases');
    }

    /**
     * Wyszukuje Cases w bazie danych
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<Case[]> - Lista znalezionych Cases
     */
    async find(orConditions: CasesSearchParams[] = []): Promise<Case[]> {
        const milestoneParentTypeCondition =
            orConditions[0]._contract?.id || orConditions[0].contractId
                ? 'Milestones.ContractId IS NOT NULL'
                : 'Milestones.OfferId IS NOT NULL';

        const sql = `SELECT 
            Cases.Id,
            CaseTypes.Id AS CaseTypeId,
            CaseTypes.Name AS CaseTypeName,
            CaseTypes.IsDefault,
            CaseTypes.IsUniquePerMilestone,
            CaseTypes.MilestoneTypeId,
            CaseTypes.FolderNumber AS CaseTypeFolderNumber,
            Cases.Name,
            Cases.Number,
            Cases.Description,
            Cases.GdFolderId,
            Cases.LastUpdated,
            Milestones.Id AS MilestoneId,
            Milestones.ContractId,
            Milestones.Name AS MilestoneName,
            Milestones.GdFolderId AS MilestoneGdFolderId,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            MilestoneTypes.IsUniquePerContract,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
            OurContractsData.OurId AS ContractOurId,
            Contracts.Id AS ContractId,
            Contracts.Alias AS ContractAlias,
            Contracts.Number AS ContractNumber,
            Contracts.Name AS ContractName,
            ContractTypes.Id AS MainContractTypeId, 
            ContractTypes.Name AS TypeName, 
            ContractTypes.IsOur AS TypeIsOur, 
            ContractTypes.Description AS TypeDescription,
            Offers.Id AS OfferId,
            Offers.Alias AS OfferAlias,
            Offers.IsOur AS OfferIsOur,
            Risks.Id AS RiskId,
            Risks.Probability AS RiskProbability,
            Risks.OverallImpact AS RiskOverallImpact
        FROM Cases
        LEFT JOIN CaseTypes ON Cases.TypeId=CaseTypes.Id
        JOIN Milestones ON Milestones.Id=Cases.MilestoneId
        JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
        LEFT JOIN Contracts ON Milestones.ContractId=Contracts.Id
        LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
        LEFT JOIN Offers ON Milestones.OfferId=Offers.Id
        LEFT JOIN Risks ON Risks.CaseId=Cases.Id
        LEFT JOIN MilestoneTypes_ContractTypes 
            ON  MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId 
            AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
        LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId = MilestoneTypes.Id
        WHERE ${this.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
            AND ${milestoneParentTypeCondition}
        ORDER BY Contracts.Id, Milestones.Id, CaseTypes.FolderNumber`;

        const result: any[] = await this.executeQuery(sql);

        // Pobierz powiązane dane
        const [processes, processesInstances] = await Promise.all([
            ProcessesController.find({
                projectId: orConditions[0]?.projectId,
                contractId: orConditions[0]?.contractId,
                milestoneId: orConditions[0]?.milestoneId,
            }),
            ProcessInstancesController.find({
                projectId: orConditions[0]?.projectId,
                contractId: orConditions[0]?.contractId,
                milestoneId: orConditions[0]?.milestoneId,
            }),
        ]);

        // Mapuj wyniki z uwzględnieniem filtrów
        const cases: Case[] = [];
        for (const row of result) {
            const caseItem = this.mapRowToModel(
                row,
                processes,
                processesInstances
            );

            // Sprawdź dodatkowe kryteria
            if (this.checkCriteria(caseItem, orConditions[0])) {
                cases.push(caseItem);
            }
        }

        return cases;
    }

    /**
     * Mapuje wiersz z bazy danych na instancję Case
     *
     * @param row - Wiersz z bazy danych
     * @param processes - Lista procesów (dla filtrowania)
     * @param processesInstances - Lista instancji procesów
     * @returns Case - Zmapowana instancja
     */
    protected mapRowToModel(
        row: any,
        processes?: any[],
        processesInstances?: any[]
    ): Case {
        const _contract = this.makeContractObject(row);
        const _offer = this.makeOfferObject(row);

        return new Case({
            id: row.Id,
            _type: {
                id: row.CaseTypeId,
                name: row.CaseTypeName,
                isDefault: row.IsDefault,
                isUniquePerMilestone: row.IsUniquePerMilestone,
                milestoneTypeId: row.MilestoneTypeId,
                folderNumber: row.CaseTypeFolderNumber,
                _processes:
                    processes?.filter(
                        (item: any) => item._caseType.id == row.CaseTypeId
                    ) || [],
            },
            name: ToolsDb.sqlToString(row.Name),
            number: row.Number,
            description: ToolsDb.sqlToString(row.Description),
            gdFolderId: row.GdFolderId,
            _parent: new Milestone({
                id: row.MilestoneId,
                contractId: row.ContractId,
                gdFolderId: row.MilestoneGdFolderId,
                name: row.MilestoneName,
                _type: {
                    id: row.MilestoneTypeId,
                    name: row.MilestoneTypeName,
                    _folderNumber: row.MilestoneTypeFolderNumber,
                    isUniquePerContract: row.IsUniquePerContract,
                },
                _contract,
                _offer,
                _dates: [],
            }),
            _risk: new Risk({
                id: row.RiskId,
                probability: row.RiskProbability,
                overallImpact: row.RiskOverallImpact,
            }),
            _processesInstances:
                processesInstances?.filter(
                    (item: any) => item._case.id == row.Id
                ) || [],
        });
    }

    /**
     * Tworzy warunki AND dla pojedynczej grupy warunków OR
     */
    private makeAndConditions(searchParams: CasesSearchParams): string {
        const projectCondition = searchParams.projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [
                  searchParams.projectId,
              ])
            : '1';

        const contractId =
            searchParams.contractId || searchParams._contract?.id;
        const contractCondition = contractId
            ? mysql.format('Contracts.Id = ?', [contractId])
            : '1';

        const offerId = searchParams.offerId || searchParams._offer?.id;
        const offerCondition = offerId
            ? mysql.format('Offers.Id = ?', [offerId])
            : '1';

        const milestoneCondition = searchParams.milestoneId
            ? mysql.format('Cases.MilestoneId = ?', [searchParams.milestoneId])
            : '1';

        const caseCondition = searchParams.caseId
            ? mysql.format('Cases.Id = ?', [searchParams.caseId])
            : '1';

        const typeIdCondition = searchParams.typeId
            ? mysql.format('Cases.TypeId = ?', [searchParams.typeId])
            : '1';

        const milestoneTypeCondition = searchParams.milestoneTypeId
            ? mysql.format('MilestoneTypes.Id = ?', [
                  searchParams.milestoneTypeId,
              ])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${projectCondition} 
            AND ${contractCondition} 
            AND ${offerCondition}
            AND ${milestoneCondition} 
            AND ${caseCondition}
            AND ${searchTextCondition}
            AND ${typeIdCondition}
            AND ${milestoneTypeCondition}`;
    }

    /**
     * Tworzy warunek wyszukiwania tekstowego
     */
    private makeSearchTextCondition(searchText?: string): string {
        if (!searchText) return '1';

        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Cases.Number LIKE ? 
                    OR Cases.Name LIKE ?
                    OR Cases.Description LIKE ?
                    OR CaseTypes.FolderNumber LIKE ?
                    OR Milestones.Name LIKE ?
                    OR CaseTypes.Name LIKE ?)`,
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );

        return conditions.join(' AND ');
    }

    /**
     * Sprawdza dodatkowe kryteria filtrowania
     */
    private checkCriteria(
        caseItem: Case,
        criteria: CasesSearchParams
    ): boolean {
        if (criteria.hasProcesses === undefined) return true;

        const hasProcesses: boolean = criteria.hasProcesses === 'true';
        return !!(
            caseItem._processesInstances &&
            hasProcesses === caseItem._processesInstances.length > 0
        );
    }

    /**
     * Pomocnicza metoda do tworzenia obiektu Contract
     */
    private makeContractObject(row: any) {
        if (!row.ContractId) return;

        const contractInitParam = {
            id: row.ContractId,
            ourId: row.ContractOurId,
            number: row.ContractNumber,
            alias: row.ContractAlias,
            name: row.ContractName,
            _type: {
                id: row.MainContractTypeId,
                name: row.TypeName,
                description: row.TypeDescription,
                isOur: row.TypeIsOur,
            },
        };

        return contractInitParam.ourId
            ? new ContractOur(contractInitParam)
            : new ContractOther(contractInitParam);
    }

    /**
     * Pomocnicza metoda do tworzenia obiektu Offer
     */
    private makeOfferObject(row: any) {
        if (!row.OfferId) return;

        // Validate city data before creating offer object
        if (!row.CityId && (!row.CityName || !row.CityName.trim())) {
            console.warn(
                `Offer ${row.OfferId} has invalid city data in CaseRepository`
            );
        }

        const offerInitParam: OfferData = {
            id: row.OfferId,
            alias: row.OfferAlias,
            isOur: row.OfferIsOur,
            form: row.OfferForm,
            bidProcedure: row.OfferBidProcedure,
            employerName: row.OfferEmployerName,
            gdFolderId: row.GdFolderId,
            _city: { id: row.CityId, name: row.CityName, code: row.CityCode },
            _type: {
                id: row.OfferTypeId,
                name: row.OfferTypeName,
                isOur: row.OfferTypeIsOur,
                description: row.OfferTypeDescription,
            },
        };
        return offerInitParam;
    }

    /**
     * Dodaje Case do bazy wraz z powiązanymi ProcessInstances i domyślnymi Tasks
     *
     * ZGODNIE Z WYTYCZNYMI: Repository tylko operacje DB, bez orkiestracji
     * Controller zarządza transakcją i wywołuje tę metodę
     *
     * @param caseItem - Case do dodania
     * @param processInstances - Instancje procesów do utworzenia
     * @param defaultTasks - Domyślne zadania do utworzenia
     * @param conn - Połączenie DB (wymagane - część transakcji Controller)
     * @returns Case z uzupełnionym ID i numerem
     */
    async addWithRelated(
        caseItem: Case,
        processInstances: any[],
        defaultTasks: any[],
        conn: mysql.PoolConnection
    ): Promise<Case> {
        // 1. Dodaj Case do DB
        await this.addInDb(caseItem, conn, true);
        console.log(
            'CaseRepository.addWithRelated - case inserted id=',
            caseItem.id
        );

        // 2. Dodaj domyślne Tasks (REFAKTORYZACJA - użyj TaskRepository)
        const taskRepository = new TaskRepository();
        const addedTasks: any[] = [];

        for (const task of defaultTasks) {
            console.log(
                'About to insert default task, caseItem.id=',
                caseItem.id,
                'task before:',
                {
                    name: task.name,
                    caseId: task.caseId,
                }
            );

            task.caseId = caseItem.id;
            if (task._parent) task._parent.id = caseItem.id;

            // Repository używa innego Repository (enkapsulacja logiki dostępu do Tasks)
            const addedTask = await taskRepository.addInDb(task, conn, true);
            addedTasks.push(addedTask);

            console.log('Inserted default task id=', addedTask.id);
        }

        // Zastąp oryginalną tablicę zadaniami z ID
        defaultTasks.length = 0;
        defaultTasks.push(...addedTasks);

        // 3. Dodaj Tasks z ProcessInstances (REFAKTORYZACJA - użyj TaskRepository)
        for (const processInstance of processInstances) {
            console.log(
                'About to insert processInstance task, caseItem.id=',
                caseItem.id,
                'task before:',
                processInstance._task
                    ? {
                          name: processInstance._task.name,
                          id: processInstance._task.id,
                          caseId: processInstance._task.caseId,
                      }
                    : undefined
            );

            const taskObj = processInstance._task;

            if (taskObj && !taskObj.id) {
                taskObj.caseId = caseItem.id;
                if (taskObj._parent) taskObj._parent.id = caseItem.id;

                // Repository używa innego Repository (enkapsulacja logiki dostępu do Tasks)
                const addedTask = await taskRepository.addInDb(
                    taskObj,
                    conn,
                    true
                );

                // Zaktualizuj referencję w processInstance
                processInstance._task = addedTask;

                console.log('Inserted processInstance task id=', addedTask.id);
            }
        }

        // 4. Dodaj ProcessInstances (mają już taskId ustawione)
        for (const processInstance of processInstances) {
            if (processInstance._task && !processInstance.taskId)
                processInstance.taskId = processInstance._task.id;
            processInstance.caseId = caseItem.id;

            console.log(
                'About to insert processInstance, caseId=',
                processInstance.caseId,
                'taskId=',
                processInstance.taskId
            );

            await processInstance.addInDb(conn, true);
        }

        // 5. Pobierz wygenerowany numer (jeśli nie jest unique)
        if (!caseItem.number && !caseItem._type.isUniquePerMilestone) {
            caseItem.number = await this.getNumber(caseItem.id!, conn);
        }

        return caseItem;
    }

    /**
     * Pobiera numer Case z bazy (dla non-unique Cases)
     *
     * @param caseId - ID Case
     * @param conn - Połączenie DB
     * @returns Numer Case lub undefined dla unique Cases
     */
    async getNumber(
        caseId: number,
        conn?: mysql.PoolConnection
    ): Promise<number | undefined> {
        const sql = `SELECT Cases.Number FROM Cases WHERE Cases.Id = ?`;
        const result = <mysql.RowDataPacket[]>(
            await ToolsDb.getQueryCallbackAsync(
                mysql.format(sql, [caseId]),
                conn
            )
        );
        const row = result[0];
        if (!row?.Number) {
            throw new Error(
                `No Number found in db for nonUnique Case ${caseId}`
            );
        }
        return row.Number as number;
    }

    /**
     * Usuwa wszystkie ProcessInstances powiązane z Case
     *
     * @param caseId - ID Case
     */
    async deleteProcessInstances(caseId: number): Promise<void> {
        const sql = `DELETE FROM ProcessInstances WHERE CaseId = ?`;
        await ToolsDb.executePreparedStmt(sql, [caseId], { id: caseId });
    }

    /**
     * Edytuje Case w bazie wraz z opcjonalną resetowaniem ProcessInstances
     *
     * ZGODNIE Z WYTYCZNYMI: Repository tylko operacje DB, bez orkiestracji
     * Controller zarządza transakcją i wywołuje tę metodę
     *
     * @param caseItem - Case do edycji
     * @param shouldResetProcessInstances - Czy zresetować ProcessInstances (przy zmianie typu)
     * @param newProcessInstances - Nowe ProcessInstances (jeśli reset)
     * @param conn - Połączenie DB (wymagane - część transakcji Controller)
     * @returns Zaktualizowany Case
     */
    async editWithRelated(
        caseItem: Case,
        shouldResetProcessInstances: boolean,
        newProcessInstances: any[],
        conn: mysql.PoolConnection
    ): Promise<Case> {
        // 1. Edytuj Case
        await this.editInDb(caseItem, conn, true);

        // 2. Jeśli trzeba, zresetuj ProcessInstances
        if (shouldResetProcessInstances) {
            await this.deleteProcessInstances(caseItem.id!);

            // Dodaj nowe ProcessInstances
            for (const processInstance of newProcessInstances) {
                await processInstance.addInDb(conn, true);
            }
        }

        return caseItem;
    }
}
