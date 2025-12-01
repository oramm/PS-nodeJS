import Project from '../projects/Project';
import BaseRepository from '../repositories/BaseRepository';
import mysql from 'mysql2/promise';
import ContractType from './contractTypes/ContractType';
import Person from '../persons/Person';
import {
    CityData,
    ContractRangeData,
    ContractRangePerContractData,
    ContractTypeData,
} from '../types/types';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ToolsDb from '../tools/ToolsDb';
import Setup from '../setup/Setup';
import ContractRangeContractRepository from './contractRangesContracts/ContractRangeContractRepository';
import Tools from '../tools/Tools';
import Entity from '../entities/Entity';

/**
 * Repozytorium dla operacji na kontraktach
 */
export default class ContractRepository extends BaseRepository<
    ContractOur | ContractOther
> {
    constructor() {
        super('Contracts');
    }

    /**
     * Wyszukuje miasta z opcjonalnymi kryteriami
     */
    async find(
        orConditions: ContractSearchParams[] = []
    ): Promise<(ContractOur | ContractOther)[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        const sql = `SELECT mainContracts.Id, 
                    mainContracts.Alias, 
                    mainContracts.Number, 
                    mainContracts.Name, 
                    mainContracts.OurIdRelated, 
                    mainContracts.ProjectOurId,
                    mainContracts.StartDate, 
                    mainContracts.EndDate, 
                    mainContracts.GuaranteeEndDate,
                    mainContracts.Value,
                    mainContracts.Comment, 
                    mainContracts.Status, 
                    mainContracts.GdFolderId, 
                    mainContracts.MeetingProtocolsGdFolderId, 
                    mainContracts.MaterialCardsGdFolderId,
                    mainContracts.LastUpdated,
                    OurContractsData.OurId, 
                    OurContractsData.ManagerId, 
                    OurContractsData.AdminId,
                    Cities.Id AS CityId,
                    Cities.Name AS CityName,
                    Cities.Code AS CityCode,
                    Projects.Id AS ProjectId,
                    Projects.OurId AS ProjectOurId,
                    Projects.Name AS ProjectName,
                    Projects.Alias AS ProjectAlias,
                    Projects.GdFolderId AS ProjectGdFolderId,
                    ${this.makeOptionalColumns(
                        orConditions[0] ?? ({} as ContractSearchParams)
                    )},
                    Admins.Name AS AdminName, 
                    Admins.Surname AS AdminSurname, 
                    Admins.Email AS AdminEmail, 
                    Managers.Name AS ManagerName, 
                    Managers.Surname AS ManagerSurname, 
                    Managers.Email AS ManagerEmail, 
                    RelatedContracts.Id AS RelatedId, 
                    RelatedContracts.Name AS RelatedName, 
                    RelatedContracts.GdFolderId AS RelatedGdFolderId,
                    RelatedOurContractsData.AdminId AS RelatedAdminId,
                    RelatedOurContractsData.ManagerId AS RelatedManagerId,
                    ContractTypes.Id AS MainContractTypeId, 
                    ContractTypes.Name AS TypeName, 
                    ContractTypes.IsOur AS TypeIsOur, 
                    ContractTypes.Description AS TypeDescription,
                    GROUP_CONCAT(DISTINCT ContractRanges.Name ORDER BY ContractRanges.Name SEPARATOR ', ') AS ContractRangesNames
                  FROM Contracts AS mainContracts
                  LEFT JOIN OurContractsData ON OurContractsData.Id=mainContracts.id
                  LEFT JOIN Cities ON Cities.Id=OurContractsData.CityId
                  JOIN Projects ON Projects.OurId=mainContracts.ProjectOurId
                  LEFT JOIN Contracts AS RelatedContracts ON RelatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=mainContracts.OurIdRelated)
                  LEFT JOIN OurContractsData AS RelatedOurContractsData ON RelatedOurContractsData.OurId = mainContracts.OurIdRelated
                  LEFT JOIN ContractTypes ON ContractTypes.Id = mainContracts.TypeId
                  LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id
                  LEFT JOIN Persons AS Managers ON OurContractsData.ManagerId = Managers.Id
                  LEFT JOIN Invoices ON Invoices.ContractId=mainContracts.Id
                  LEFT JOIN InvoiceItems ON InvoiceItems.ParentId=Invoices.Id
                  LEFT JOIN ContractRangesContracts ON ContractRangesContracts.ContractId=mainContracts.Id
                  LEFT JOIN ContractRanges ON ContractRangesContracts.ContractRangeId = ContractRanges.Id
                  WHERE ${conditions}
                  GROUP BY mainContracts.Id
                  ORDER BY mainContracts.EndDate, mainContracts.ProjectOurId, OurContractsData.OurId, mainContracts.Number`;

        const rows: ContractRow[] = await this.executeQuery(sql);
        const { entitiesPerProject, rangesPerContract } =
            await this.setContractPartsbySearchParams(orConditions[0]);

        return rows.map((row) =>
            this.mapRowToModel({
                ...row,
                entitiesPerProject,
                rangesPerContract,
            })
        );
    }

    private makeOptionalColumns(searchParams: ContractSearchParams) {
        const remainingNotScheduledValueColumn = searchParams.getRemainingValue
            ? `(SELECT mainContracts.Value - IFNULL(
                (SELECT SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice)
                   FROM Invoices 
                   JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id 
                  WHERE Invoices.ContractId = mainContracts.Id 
                    AND Invoices.Status IN('Zrobiona','Wysłana','Zapłacona')
                ), 0)
               ) AS RemainingNotScheduledValue`
            : `NULL AS RemainingNotScheduledValue`;

        const remainingNotIssuedColumn = searchParams.getRemainingValue
            ? `(SELECT mainContracts.Value - IFNULL(
                (SELECT SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice) 
                   FROM Invoices 
                   JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id 
                  WHERE Invoices.ContractId = mainContracts.Id 
                    AND Invoices.Status IN('Zrobiona','Wysłana','Zapłacona')
                ), 0)
               ) AS RemainingNotIssuedValue`
            : `NULL AS RemainingNotIssuedValue`;

        return `${remainingNotScheduledValueColumn}, ${remainingNotIssuedColumn}`;
    }

    /**
     * Pomocnicza metoda do budowania warunków AND
     */
    private makeAndConditions(searchParams: ContractSearchParams): string {
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
        if (searchParams._contractRanges?.length) {
            const contractRangesCondition =
                ToolsDb.makeOrConditionFromValueOrArray(
                    searchParams._contractRanges.map((range) => range.id),
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
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        // Return the combined conditions or default to '1' if empty
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Tworzy warunek dla wyszukiwania tekstowego: OR pomiędzy polami, AND pomiędzy słowami
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText?.trim()) return '1';

        const searchFields = [
            'mainContracts.Name',
            'mainContracts.Number',
            'mainContracts.Alias',
            'OurContractsData.OurId',
        ];

        const words = searchText.trim().split(/\s+/);
        const wordGroups = words.map((word) => {
            const ors = searchFields.map((field) =>
                mysql.format(`${field} LIKE ?`, [`%${word}%`])
            );
            return `(${ors.join(' OR ')})`;
        });

        return wordGroups.join(' AND ');
    }

    private rangeRepository = new ContractRangeContractRepository();

    private async setContractPartsbySearchParams(
        searchParams: ContractSearchParams
    ) {
        let entitiesPerProject: ContractEntityAssociation[] = [];
        let rangesPerContract: ContractRangePerContractData[] = [];
        //wybrano widok szczegółowy dla projketu lub kontraktu
        if (searchParams.projectOurId || searchParams.id) {
            entitiesPerProject = await this.getContractEntityAssociationsList({
                projectId: searchParams.projectOurId,
                contractId: searchParams.id,
                isArchived: searchParams.isArchived,
            });
            // Użyj Repository zamiast Controller (Clean Architecture)
            const rangeAssociations = await this.rangeRepository.find({
                contractId: searchParams.id,
            });
            rangesPerContract = rangeAssociations.map((assoc) => ({
                _contractRange: assoc._contractRange,
                associationComment: assoc.associationComment,
            }));
        }
        return { entitiesPerProject, rangesPerContract };
    }

    private async getContractEntityAssociationsList(initParamObject: {
        projectId?: string;
        contractId?: number;
        isArchived?: boolean;
    }) {
        const projectConditon =
            initParamObject && initParamObject.projectId
                ? mysql.format('Contracts.ProjectOurId = ?', [
                      initParamObject.projectId,
                  ])
                : '1';

        const contractConditon =
            initParamObject && initParamObject.contractId
                ? mysql.format('Contracts.Id = ?', [initParamObject.contractId])
                : '1';
        const sql = `SELECT
                Contracts_Entities.ContractId,
                Contracts_Entities.EntityId,
                Contracts_Entities.ContractRole,
                Entities.Name,
                Entities.Address,
                Entities.TaxNumber,
                Entities.Www,
                Entities.Email,
                Entities.Phone
                        FROM Contracts_Entities
                        JOIN Contracts ON Contracts_Entities.ContractId = Contracts.Id
                        JOIN Entities ON Contracts_Entities.EntityId = Entities.Id
                        LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
                        WHERE ${projectConditon} 
                        AND ${contractConditon}
                        ORDER BY Contracts_Entities.ContractRole, Entities.Name`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return this.processContractEntityAssociations(result);
    }

    private processContractEntityAssociations(result: any[]) {
        let newResult: ContractEntityAssociation[] = [];

        for (const row of result) {
            const item: ContractEntityAssociation = {
                contractRole: row.ContractRole,
                _contract: {
                    id: row.ContractId,
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: row.Name,
                    address: row.Address,
                    taxNumber: row.TaxNumber,
                    www: row.Www,
                    email: row.Email,
                    phone: row.Phone,
                }),
            };

            newResult.push(item);
        }
        return newResult;
    }

    /**
     * Mapuje surowe dane z bazy na instancję Contract
     */
    protected mapRowToModel(row: ContractRow): ContractOur | ContractOther {
        const { entitiesPerProject, rangesPerContract } = row;
        const contractors = entitiesPerProject!.filter(
            (item: ContractEntityAssociation) =>
                item._contract.id === row.Id &&
                item.contractRole === 'CONTRACTOR'
        );
        const engineers = entitiesPerProject!.filter(
            (item: ContractEntityAssociation) =>
                item._contract.id === row.Id && item.contractRole === 'ENGINEER'
        );
        const employers = entitiesPerProject!.filter(
            (item: ContractEntityAssociation) =>
                item._contract.id === row.Id && item.contractRole === 'EMPLOYER'
        );

        const initParam = {
            id: row.Id,
            alias: row.Alias,
            number: row.Number,
            name: ToolsDb.sqlToString(row.Name!),
            _city: this.mapCityToModel(row),
            //kontrakt powiązany z kontraktem na roboty
            _ourContract: {
                ourId: row.OurIdRelated,
                id: row.RelatedId,
                name: ToolsDb.sqlToString(row.RelatedName || ''),
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
            comment: ToolsDb.sqlToString(row.Comment || ''),
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

        return item;
    }

    private mapCityToModel(row: ContractRow): CityData | undefined {
        if (!row.CityId) return undefined;
        if (!row.CityName || !row.CityCode)
            throw new Error(
                `Inconsistent city data for Contract.Id=${
                    row.Id ?? 'unknown'
                }: CityId=${row.CityId} but missing CityName/CityCode`
            );

        return {
            id: row.CityId,
            name: ToolsDb.sqlToString(row.CityName),
            code: row.CityCode,
        };
    }

    /**
     * Helper do filtrowania entities po roli kontraktu
     */
    private getEntitiesByRole(
        entitiesPerProject: ContractEntityAssociation[] = [],
        contractId: number,
        role: 'CONTRACTOR' | 'ENGINEER' | 'EMPLOYER'
    ): Entity[] {
        return entitiesPerProject
            .filter(
                (i) => i._contract.id === contractId && i.contractRole === role
            )
            .map((i) => i._entity);
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
}
export type ContractEntityAssociation = {
    contractRole: 'CONTRACTOR' | 'ENGINEER' | 'EMPLOYER';
    _contract: {
        id: number;
    };
    _entity: Entity;
};

export type ContractPartsData = {
    entitiesPerProject: ContractEntityAssociation[];
    rangesPerContract: ContractRangePerContractData[];
};

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
    _contractRanges?: ContractRangeData[];
};

type ContractRow = {
    Id: number;
    Alias: string | null;
    Number: string | null;
    Name: string | null;
    OurIdRelated: number | null;
    ProjectId: number;
    ProjectOurId: number;
    ProjectName: string | null;
    ProjectAlias: string | null;
    ProjectGdFolderId: string | null;
    StartDate: Date | string | null;
    EndDate: Date | string | null;
    GuaranteeEndDate: Date | string | null;
    Value: number | null;
    RemainingNotScheduledValue?: number | null;
    RemainingNotIssuedValue?: number | null;
    Comment: string | null;
    Status: number | string | null;
    GdFolderId: string | null;
    MeetingProtocolsGdFolderId: string | null;
    MaterialCardsGdFolderId: string | null;
    OurId: number | null;
    ManagerId: number | null;
    ManagerName: string | null;
    ManagerSurname: string | null;
    ManagerEmail: string | null;
    AdminId: number | null;
    AdminName: string | null;
    AdminSurname: string | null;
    AdminEmail: string | null;
    MainContractTypeId: number;
    TypeName: string | null;
    TypeIsOur: boolean | 0 | 1;
    TypeDescription: string | null;
    CityId?: number | null;
    CityName?: string | null;
    CityCode?: string | null;
    RelatedId?: number | null;
    RelatedName?: string | null;
    RelatedGdFolderId?: string | null;
    ContractRangesNames?: string | null;
    LastUpdated?: Date | string | null;
    entitiesPerProject?: ContractEntityAssociation[];
    rangesPerContract?: ContractRangePerContractData[];
};
