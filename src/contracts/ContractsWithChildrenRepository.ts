import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import ToolsDb from '../tools/ToolsDb';
import Case from './milestones/cases/Case';
import Task from './milestones/cases/tasks/Task';
import Milestone from './milestones/Milestone';
import Contract from './Contract';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ToolsGd from '../tools/ToolsGd';
import ToolsDate from '../tools/ToolsDate';
import { ContractsWithChildren } from './ContractTypes';
import Person from '../persons/Person';
import Project from '../projects/Project';
import Setup from '../setup/Setup';
import ContractEntityAssociationsHelper, {
    ContractEntityAssociation,
} from './ContractEntityAssociationsHelper';

export type ContractsWithChildrenSearchParams = {
    _project?: Project;
    _contract?: Contract;
    contractId?: number;
    _milestone?: Milestone;
    milestoneId?: number;
    _case?: Case;
    contractStatusCondition?: string;
    _owner?: Person;
    deadlineFrom?: string;
    deadlineTo?: string;
    searchText?: string;
    statusType?: 'active' | 'archived' | 'all';
    statuses?: string[];
};

/**
 * Repository dla ContractsWithChildren - warstwa dostępu do danych
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseRepository (ale nie używa standardowych metod CRUD)
 * - Odpowiedzialny TYLKO za operacje SQL i mapowanie
 * - NIE zawiera logiki biznesowej
 * - Zwraca instancje Model (nie plain objects)
 *
 * UWAGA: Ten Repository NIE używa standardowych metod CRUD z BaseRepository,
 * ponieważ zwraca specjalizowaną strukturę hierarchiczną (ContractsWithChildren).
 */
export default class ContractsWithChildrenRepository extends BaseRepository<ContractsWithChildren> {
    constructor() {
        super('Contracts'); // Tabela główna
    }
    /**
     * Wyszukuje kontrakty z pełną hierarchią (Milestones → Cases → Tasks)
     * PRZENIESIONE Z: ContractsWithChildrenController.getContractsList()
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<ContractsWithChildren[]> - Kontrakty z hierarchią dzieci
     */
    async find(
        orConditions: ContractsWithChildrenSearchParams[] = []
    ): Promise<ContractsWithChildren[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        // WZORZEC: SQL inline w find() (jak w MilestoneRepository, CaseRepository)
        const sql = `SELECT  Tasks.Id,
                Contracts.Id AS ContractId,
                Contracts.Alias AS ContractAlias,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName,
                Contracts.Comment AS ContractComment,
                Contracts.StartDate AS ContractStartDate,
                Contracts.EndDate AS ContractEndDate,
                Contracts.Value AS ContractValue,
                Contracts.Status AS ContractStatus,
                Contracts.GdFolderId AS ContractGdFolderId,
                OurContractsData.OurId AS ContractOurId,
                RelatedContracts.Id AS RelatedId,
                RelatedContracts.Name AS RelatedName,
                RelatedContracts.GdFolderId AS RelatedGdFolderId,
                RelatedOurContractsData.OurId AS RelatedOurId,
                RelatedManagers.Id AS RelatedManagerId,
                RelatedManagers.Name AS RelatedManagerName,
                RelatedManagers.Surname AS RelatedManagerSurname,
                RelatedManagers.Email AS RelatedManagerEmail,
                RelatedAdmins.Id AS RelatedAdminId,
                RelatedAdmins.Name AS RelatedAdminName,
                RelatedAdmins.Surname AS RelatedAdminSurname,
                RelatedAdmins.Email AS RelatedAdminEmail,
                ContractTypes.Id AS ContractTypeId,
                ContractTypes.Name AS ContractTypeName,
                ContractManagers.Id AS ContractManagerId,
                ContractManagers.Name AS ContractManagerName,
                ContractManagers.Surname AS ContractManagerSurname,
                ContractManagers.Email AS ContractManagerEmail,
                ContractAdmins.Id AS ContractAdminId,
                ContractAdmins.Name AS ContractAdminName,
                ContractAdmins.Surname AS ContractAdminSurname,
                ContractAdmins.Email AS ContractAdminEmail,
                Milestones.Id AS MilestoneId,
                Milestones.Name AS MilestoneName,
                Milestones.ContractId,
                Milestones.Status AS MilestoneStatus,
                Milestones.GdFolderId AS MilestoneGdFolderId,
                MilestoneDates.Id AS MilestoneDateId,
                MilestoneDates.StartDate AS MilestoneDateStart,
                MilestoneDates.EndDate AS MilestoneDateEnd,
                MilestoneDates.Description AS MilestoneDateDescription,
                MilestoneDates.LastUpdated AS MilestoneDateLastUpdated,
                MilestoneTypes.Id AS MilestoneTypeId,
                MilestoneTypes.Name AS MilestoneTypeName,
                MilestoneTypes.IsUniquePerContract,
                MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
                Cases.Id AS CaseId,
                Cases.Name AS CaseName,
                Cases.Description AS CaseDescription,
                Cases.TypeId AS CaseTypeId,
                Cases.GdFolderId AS CaseGdFolderId,
                Cases.Number AS CaseNumber,
                CaseTypes.Id AS CaseTypeId,
                CaseTypes.Name AS CaseTypeName,
                CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone,
                CaseTypes.FolderNumber AS CaseTypeFolderNumber,
                Tasks.Name AS TaskName,
                Tasks.Description AS TaskDescription,
                Tasks.Deadline AS TaskDeadline,
                Tasks.Status AS TaskStatus,
                Tasks.OwnerId,
                TasksOwners.Name AS OwnerName,
                TasksOwners.Surname AS OwnerSurname,
                TasksOwners.Email AS OwnerEmail
            FROM Contracts
            LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
            LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
            LEFT JOIN Contracts AS RelatedContracts ON RelatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=Contracts.OurIdRelated)
            LEFT JOIN OurContractsData AS RelatedOurContractsData ON RelatedOurContractsData.OurId = Contracts.OurIdRelated
            LEFT JOIN Milestones ON Milestones.ContractId=Contracts.Id
            LEFT JOIN Cases ON Cases.MilestoneId=Milestones.Id
            JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            LEFT JOIN CaseTypes ON Cases.typeId=CaseTypes.Id
            LEFT JOIN Tasks ON Tasks.CaseId=Cases.Id
            LEFT JOIN Persons AS ContractManagers ON OurContractsData.ManagerId = ContractManagers.Id
            LEFT JOIN Persons AS ContractAdmins ON OurContractsData.AdminId = ContractAdmins.Id
            LEFT JOIN Persons AS RelatedManagers ON RelatedOurContractsData.ManagerId = RelatedManagers.Id
            LEFT JOIN Persons AS RelatedAdmins ON RelatedOurContractsData.AdminId = RelatedAdmins.Id
            JOIN MilestoneTypes_ContractTypes
                ON  MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId
                AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
            LEFT JOIN Persons AS TasksOwners ON TasksOwners.Id = Tasks.OwnerId
            LEFT JOIN MilestoneDates ON MilestoneDates.MilestoneId = Milestones.Id
            WHERE ${conditions}
            ORDER BY Contracts.Id, MilestoneTypeFolderNumber, CaseTypeFolderNumber, Cases.Id`;

        const rows: ContractsWithChildrenRow[] = await this.executeQuery(sql);

        // Pobierz asocjacje entities dla kontraktów (Helper - współdzielona logika)
        const entitiesPerProject =
            await ContractEntityAssociationsHelper.getContractEntityAssociationsList(
                {
                    projectId: orConditions[0]?._project?.ourId,
                    contractId: orConditions[0]?.contractId,
                    isArchived: orConditions[0]?.statusType === 'archived',
                }
            );

        return this.processContractsResult(rows, entitiesPerProject);
    }

    /**
     * Buduje warunki AND dla pojedynczej grupy warunków OR
     * PRZENIESIONE Z: ContractsWithChildrenController.makeAndConditions()
     * ZMIANA: static → private (tylko Repository używa)
     * WZORZEC: push/join zamiast konkatenacji (zgodnie z ContractRepository)
     */
    private makeAndConditions(
        searchParams: ContractsWithChildrenSearchParams
    ): string {
        const conditions: string[] = [];

        // Contract ID
        const contractId =
            searchParams.contractId || searchParams._contract?.id;
        if (contractId) {
            conditions.push(mysql.format('Contracts.Id = ?', [contractId]));
        }

        // Milestone ID
        const milestoneId =
            searchParams._milestone?.id || searchParams.milestoneId;
        if (milestoneId) {
            conditions.push(mysql.format('Milestones.Id = ?', [milestoneId]));
        }

        // Case ID
        const caseId = searchParams._case?.id;
        if (caseId) {
            conditions.push(mysql.format('Cases.Id = ?', [caseId]));
        }

        // Project
        const projectOurId = searchParams._project?.ourId;
        if (projectOurId) {
            conditions.push(
                mysql.format('Contracts.ProjectOurId = ?', [projectOurId])
            );
        }

        // Status Type (active/archived/all)
        switch (searchParams.statusType) {
            case 'active':
                conditions.push(
                    `Contracts.Status NOT REGEXP "${Setup.ContractStatus.ARCHIVAL}"`
                );
                break;
            case 'archived':
                conditions.push(
                    `Contracts.Status REGEXP "${Setup.ContractStatus.ARCHIVAL}"`
                );
                break;
            case 'all':
            default:
                // Brak warunku dla 'all'
                break;
        }

        // Statuses array
        if (searchParams.statuses?.length) {
            const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(
                searchParams.statuses,
                'Contracts',
                'Status'
            );
            conditions.push(statusCondition);
        }

        // Search text
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        // Return combined conditions or default to '1' if empty
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Buduje warunek wyszukiwania tekstowego
     * PRZENIESIONE Z: ContractsWithChildrenController.makeSearchTextCondition()
     * ZMIANA: static → private
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Tasks.Name LIKE ?
                          OR Tasks.Description LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    /**
     * Mapuje wyniki SQL na strukturę hierarchiczną
     * PRZENIESIONE Z: ContractsWithChildrenController.processContractsResult()
     * ZMIANA: static → private, any[] → ContractsWithChildrenRow[]
     * DODANO: parametr entitiesPerProject dla contractors/engineers/employers
     *
     * ⚠️ KRYTYCZNE: Kod 1:1 z obecnego Controller
     * Każde pole z SQL MUSI być zachowane
     */
    private processContractsResult(
        result: ContractsWithChildrenRow[],
        entitiesPerProject: ContractEntityAssociation[] = []
    ): ContractsWithChildren[] {
        const contracts: { [id: string]: ContractOur | ContractOther } = {};
        const contractsWithChildren: ContractsWithChildren[] = [];
        // Tworzymy zbiór kamieni milowych, aby uniknąć duplikacji
        const milestonesById: { [id: number]: Milestone } = {};

        for (const row of result) {
            let contract = contracts[row.ContractId];
            if (!contract) {
                // Filtruj entities po rolach - analogicznie jak w ContractRepository
                const contractors = entitiesPerProject.filter(
                    (item: ContractEntityAssociation) =>
                        item._contract.id === row.ContractId &&
                        item.contractRole === 'CONTRACTOR'
                );
                const engineers = entitiesPerProject.filter(
                    (item: ContractEntityAssociation) =>
                        item._contract.id === row.ContractId &&
                        item.contractRole === 'ENGINEER'
                );
                const employers = entitiesPerProject.filter(
                    (item: ContractEntityAssociation) =>
                        item._contract.id === row.ContractId &&
                        item.contractRole === 'EMPLOYER'
                );

                const initParams = {
                    id: row.ContractId,
                    ourId: row.ContractOurId,
                    number: row.ContractNumber,
                    name: ToolsDb.sqlToString(row.ContractName ?? ''),
                    comment: ToolsDb.sqlToString(row.ContractComment ?? ''),
                    startDate: ToolsDate.dateJsToSql(
                        row.ContractStartDate ?? ''
                    ),
                    endDate: ToolsDate.dateJsToSql(row.ContractEndDate ?? ''),
                    value: row.ContractValue,
                    status: row.ContractStatus,
                    gdFolderId: row.ContractGdFolderId,
                    _gdFolderUrl: ToolsGd.createGdFolderUrl(
                        row.ContractGdFolderId ?? ''
                    ),
                    alias: row.ContractAlias,
                    _type: {
                        id: row.ContractTypeId,
                        name: row.ContractTypeName,
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
                    //kontrakt powiązany z kontraktem na roboty (tylko dla ContractOther)
                    _ourContract: row.RelatedId
                        ? {
                              ourId: row.RelatedOurId,
                              id: row.RelatedId,
                              name: ToolsDb.sqlToString(row.RelatedName || ''),
                              gdFolderId: row.RelatedGdFolderId,
                              _admin: row.RelatedAdminEmail
                                  ? {
                                        id: row.RelatedAdminId,
                                        name: row.RelatedAdminName,
                                        surname: row.RelatedAdminSurname,
                                        email: row.RelatedAdminEmail,
                                    }
                                  : undefined,
                              _manager: row.RelatedManagerEmail
                                  ? {
                                        id: row.RelatedManagerId,
                                        name: row.RelatedManagerName,
                                        surname: row.RelatedManagerSurname,
                                        email: row.RelatedManagerEmail,
                                    }
                                  : undefined,
                          }
                        : undefined,
                    _contractors: contractors.map((item) => item._entity),
                    _engineers: engineers.map((item) => item._entity),
                    _employers: employers.map((item) => item._entity),
                };

                contract = row.ContractOurId
                    ? new ContractOur(initParams)
                    : new ContractOther(initParams);
                contracts[row.ContractId] = contract;
            }

            if (!milestonesById[row.MilestoneId])
                milestonesById[row.MilestoneId] = new Milestone({
                    id: row.MilestoneId,
                    name: row.MilestoneName ?? '',
                    gdFolderId: row.MilestoneGdFolderId ?? undefined,
                    status: row.MilestoneStatus ?? undefined,
                    _dates: [],
                    _type: {
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName ?? '',
                        _folderNumber:
                            row.MilestoneTypeFolderNumber?.toString(),
                        isUniquePerContract: Boolean(row.IsUniquePerContract),
                    },
                    _contract: contract,
                });

            const uniqueMilestone = milestonesById[row.MilestoneId];
            if (
                row.MilestoneDateId &&
                !uniqueMilestone._dates.some(
                    (d) => d.id === row.MilestoneDateId
                )
            )
                uniqueMilestone._dates.push({
                    id: row.MilestoneDateId,
                    milestoneId: row.MilestoneId,
                    startDate:
                        ToolsDate.dateJsToSql(row.MilestoneDateStart ?? '') ??
                        '',
                    endDate:
                        ToolsDate.dateJsToSql(row.MilestoneDateEnd ?? '') ?? '',
                    description: ToolsDb.sqlToString(
                        row.MilestoneDateDescription ?? ''
                    ),
                    lastUpdated: row.MilestoneDateLastUpdated
                        ? ToolsDate.dateJsToSql(row.MilestoneDateLastUpdated)
                        : undefined,
                });

            const caseItem = new Case({
                id: row.CaseId ?? undefined,
                name: ToolsDb.sqlToString(row.CaseName ?? ''),
                description: ToolsDb.sqlToString(row.CaseDescription ?? ''),
                number: row.CaseNumber ?? undefined,
                gdFolderId: row.CaseGdFolderId ?? undefined,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName ?? '',
                    isDefault: Boolean(row.IsDefault),
                    isUniquePerMilestone: Boolean(row.IsUniquePerMilestone),
                    milestoneTypeId: row.MilestoneTypeId,
                    folderNumber: row.CaseTypeFolderNumber,
                },
                _parent: uniqueMilestone,
            });

            const task = new Task({
                id: row.Id,
                name: ToolsDb.sqlToString(row.TaskName ?? ''),
                description: ToolsDb.sqlToString(row.TaskDescription ?? ''),
                deadline: row.TaskDeadline ?? undefined,
                status: row.TaskStatus ?? '',
                _owner: {
                    id: row.OwnerId ? row.OwnerId : undefined,
                    name: row.OwnerName ? row.OwnerName : '',
                    surname: row.OwnerSurname ? row.OwnerSurname : '',
                    email: row.OwnerEmail ? row.OwnerEmail : '',
                },
                _parent: caseItem,
            });

            // Znajdujemy kontrakt w contractsWitchChildren lub tworzymy nowy, jeśli go nie ma
            let contractWithChildren = contractsWithChildren.find(
                (c) => c.contract.id === contract.id
            );
            if (!contractWithChildren) {
                contractWithChildren = {
                    id: contract.id as number,
                    contract: contract,
                    milestonesWithCases: [],
                };
                contractsWithChildren.push(contractWithChildren);
            }

            // Znajdujemy kamień milowy w kontrakcie lub tworzymy nowy, jeśli go nie ma
            let milestoneWithCases =
                contractWithChildren.milestonesWithCases.find(
                    (m) => m.milestone.id === uniqueMilestone.id
                );
            if (!milestoneWithCases) {
                milestoneWithCases = {
                    milestone: uniqueMilestone,
                    casesWithTasks: [],
                };
                contractWithChildren.milestonesWithCases.push(
                    milestoneWithCases
                );
            }

            if (caseItem.id) {
                // Znajdujemy sprawę w kamieniu milowym lub tworzymy nową, jeśli jej nie ma
                let caseWithTasks = milestoneWithCases.casesWithTasks.find(
                    (c) => c.caseItem.id === caseItem.id
                );
                if (!caseWithTasks) {
                    caseWithTasks = {
                        caseItem: caseItem,
                        tasks: [],
                    };
                    milestoneWithCases.casesWithTasks.push(caseWithTasks);
                }

                // Dodajemy zadanie do sprawy
                if (
                    task.id &&
                    !caseWithTasks.tasks.some((t) => t.id === task.id)
                )
                    caseWithTasks.tasks.push(task);
            }
        }

        return contractsWithChildren;
    }

    /**
     * Metoda wymagana przez BaseRepository
     * NIE jest używana w tym Repository, bo processContractsResult
     * mapuje wiele wierszy SQL na strukturę hierarchiczną
     */
    protected mapRowToModel(_row: any): ContractsWithChildren {
        throw new Error(
            'ContractsWithChildrenRepository.mapRowToModel() nie jest używana. Użyj processContractsResult() zamiast tego.'
        );
    }
}

/**
 * Typ wiersza zwracanego przez SQL query
 * Reprezentuje płaską strukturę danych z JOIN wielu tabel
 */
type ContractsWithChildrenRow = {
    // Task fields
    Id: number;
    TaskName: string | null;
    TaskDescription: string | null;
    TaskDeadline: Date | string | null;
    TaskStatus: string | null;
    OwnerId: number | null;
    OwnerName: string | null;
    OwnerSurname: string | null;
    OwnerEmail: string | null;

    // Contract fields
    ContractId: number;
    ContractAlias: string | null;
    ContractNumber: string | null;
    ContractName: string | null;
    ContractComment: string | null;
    ContractStartDate: Date | string | null;
    ContractEndDate: Date | string | null;
    ContractValue: number | null;
    ContractStatus: string | number | null;
    ContractGdFolderId: string | null;
    ContractOurId: number | null;

    // ContractType fields
    ContractTypeId: number;
    ContractTypeName: string | null;

    // ContractManager fields
    ContractManagerId: number | null;
    ContractManagerName: string | null;
    ContractManagerSurname: string | null;
    ContractManagerEmail: string | null;

    // ContractAdmin fields
    ContractAdminId: number | null;
    ContractAdminName: string | null;
    ContractAdminSurname: string | null;
    ContractAdminEmail: string | null;

    // RelatedContract fields
    RelatedId: number | null;
    RelatedName: string | null;
    RelatedGdFolderId: string | null;
    RelatedOurId: number | null;

    // RelatedManager fields
    RelatedManagerId: number | null;
    RelatedManagerName: string | null;
    RelatedManagerSurname: string | null;
    RelatedManagerEmail: string | null;

    // RelatedAdmin fields
    RelatedAdminId: number | null;
    RelatedAdminName: string | null;
    RelatedAdminSurname: string | null;
    RelatedAdminEmail: string | null;

    // Milestone fields
    MilestoneId: number;
    MilestoneName: string | null;
    MilestoneStatus: string | null;
    MilestoneGdFolderId: string | null;

    // MilestoneDate fields
    MilestoneDateId: number | null;
    MilestoneDateStart: Date | string | null;
    MilestoneDateEnd: Date | string | null;
    MilestoneDateDescription: string | null;
    MilestoneDateLastUpdated: Date | string | null;

    // MilestoneType fields
    MilestoneTypeId: number;
    MilestoneTypeName: string | null;
    IsUniquePerContract: boolean | 0 | 1;
    MilestoneTypeFolderNumber: number | null;

    // Case fields
    CaseId: number | null;
    CaseName: string | null;
    CaseDescription: string | null;
    CaseTypeId: number | null;
    CaseGdFolderId: string | null;
    CaseNumber: number | null;

    // CaseType fields
    CaseTypeName: string | null;
    IsDefault: boolean | 0 | 1;
    IsUniquePerMilestone: boolean | 0 | 1;
    CaseTypeFolderNumber: number | null;
};
