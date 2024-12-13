import mysql from 'mysql2/promise';
import Entity from '../entities/Entity';
import ToolsDb from '../tools/ToolsDb';
import ContractOther from './ContractOther';
import ContractOur from './ContractOur';
import ContractType from './contractTypes/ContractType';
import Project from '../projects/Project';
import Setup from '../setup/Setup';
import Tools from '../tools/Tools';
import {
    CityData,
    ContractRangeContractData,
    ContractRangeData,
    ContractTypeData,
} from '../types/types';
import Person from '../persons/Person';
import ContractRangesContractsController from './contractRangesContracts/ContractRangesController';

export type ContractSearchParams = {
    id?: number;
    projectId?: string;
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
    _contractRanges?: ContractRangeData[];
};

export default class ContractsController {
    static async getContractsList(orConditions: ContractSearchParams[] = []) {
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
            Projects.OurId AS ProjectOurId,
            Projects.Name AS ProjectName,
            Projects.Alias AS ProjectAlias,
            Projects.GdFolderId AS ProjectGdFolderId,
            ${this.makeOptionalColumns(orConditions[0])},
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
          WHERE ${ToolsDb.makeOrGroupsConditions(
              orConditions,
              this.makeAndConditions.bind(this)
          )}
          GROUP BY mainContracts.Id
          ORDER BY mainContracts.EndDate, mainContracts.ProjectOurId, OurContractsData.OurId, mainContracts.Number`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            return orConditions[0].onlyKeyData
                ? this.processContractsResultKeyData(result, orConditions[0])
                : await this.processContractsResult(result, orConditions[0]);
        } catch (err) {
            console.log(sql);
            throw err;
        }
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
            searchParams._project?.ourId || searchParams.projectId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;
        const isArchived = typeof searchParams.isArchived === 'string';

        const conditions: string[] = [];

        if (searchParams.id) {
            conditions.push(
                mysql.format(`mainContracts.Id = ?`, [searchParams.id])
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
                    searchParams._contractRanges?.map((range) => range.id),
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

    private static makeOptionalColumns(searchParams: ContractSearchParams) {
        const remainingNotScheduledValueColumn = searchParams.getRemainingValue
            ? `(SELECT mainContracts.Value - IFNULL(
            SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 0)) 
                AS RemainingNotScheduledValue`
            : null;

        const remainingNotIssuedColumn = searchParams.getRemainingValue
            ? `(SELECT mainContracts.Value - IFNULL(
                (SELECT SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice) 
                    FROM Invoices 
                    JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id 
                    WHERE Invoices.ContractId = mainContracts.Id 
                      AND Invoices.Status IN('Zrobiona', 'Wysłana', 'Zapłacona')), 0))
                    AS RemainingNotIssuedValue`
            : null;

        return `${remainingNotScheduledValueColumn},
                    ${remainingNotIssuedColumn} `;
    }

    private static async processContractsResult(
        result: any[],
        initParamObject: ContractSearchParams
    ) {
        const newResult: (ContractOur | ContractOther)[] = [];
        let entitiesPerProject: any[] = [];
        let rangesPerContract: ContractRangeContractData[] = [];
        //wybrano widok szczegółowy dla projketu lub kontraktu
        if (initParamObject.projectId || initParamObject.id) {
            entitiesPerProject = await this.getContractEntityAssociationsList({
                projectId: initParamObject.projectId,
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
            console.log('rangesPerContract', rangesPerContract);
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
                _contractRanges: rangesPerContract.map(
                    (item) => item._contractRange
                ),
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

    private static processContractEntityAssociations(result: any[]) {
        let newResult: any[] = [];

        for (const row of result) {
            const item = {
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
