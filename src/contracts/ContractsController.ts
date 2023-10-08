import mysql from 'mysql2/promise';
import Entity from "../entities/Entity";
import ToolsDb from '../tools/ToolsDb'
import Contract from "./Contract";
import ContractOther from "./ContractOther";
import ContractOur from "./ContractOur";
import ContractType from "./contractTypes/ContractType";
import Project from '../projects/Project';
import Setup from '../setup/Setup';

export type ContractSearchParams = {
    id?: number,
    projectId?: string,
    _parent?: Project,
    searchText?: string,
    contractOurId?: string,
    startDateFrom?: string,
    startDateTo?: string,
    endDateFrom?: string,
    endDateTo?: string,
    contractName?: string,
    contractAlias?: string,
    typeId?: number,
    _contractType?: ContractType,
    typesToInclude?: 'our' | 'other' | 'all',
    onlyOurs?: boolean,//@deprecated
    isArchived?: boolean,
    status?: string | string[],
    onlyKeyData?: boolean
}

export default class ContractsController {
    static async getContractsList(searchParams: ContractSearchParams = {}) {
        const projectOurId = searchParams._parent?.ourId || searchParams.projectId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;
        const onlyKeyData = typeof searchParams.onlyKeyData === 'string'
        const isArchived = typeof searchParams.isArchived === 'string'

        const idCondition = searchParams.id
            ? mysql.format(`mainContracts.Id = ?`, [searchParams.id])
            : '1';
        const projectCondition = projectOurId
            ? mysql.format(`mainContracts.ProjectOurId = ?`, [projectOurId])
            : '1';
        const contractOurIdCondition = searchParams.contractOurId
            ? mysql.format(`OurContractsData.OurId LIKE ?`, [`%${searchParams.contractOurId}%`])
            : '1';
        const contractNameCondition = searchParams.contractName
            ? mysql.format(`mainContracts.Name = ?`, [searchParams.contractName])
            : '1';
        const startDateFromCondition = searchParams.startDateFrom
            ? mysql.format(`mainContracts.StartDate >= ?`, [searchParams.startDateFrom])
            : '1';
        const startDateToCondition = searchParams.startDateTo
            ? mysql.format(`mainContracts.StartDate <= ?`, [searchParams.startDateTo])
            : '1';

        const endDateFromCondition = searchParams.endDateFrom
            ? mysql.format(`mainContracts.EndDate >= ?`, [searchParams.endDateFrom])
            : '1';
        const endDateToCondition = searchParams.endDateTo
            ? mysql.format(`mainContracts.EndDate <= ?`, [searchParams.endDateTo])
            : '1';
        const typeCondition = typeId
            ? mysql.format(`mainContracts.TypeId = ?`, [typeId])
            : '1';


        let statusCondition = '1';
        if (searchParams.status) {
            if (typeof searchParams.status === 'string') {
                statusCondition = mysql.format(`mainContracts.Status = ?`, [searchParams.status])
            } else if (Array.isArray(searchParams.status)) {
                const statusConditions = searchParams.status.map(status => mysql.format(`mainContracts.Status = ?`, [status]));
                statusCondition = '(' + statusConditions.join(' OR ') + ')';
            }
        }


        let typesToIncudeCondition;
        switch (searchParams.typesToInclude) {
            case 'our':
                typesToIncudeCondition = 'OurContractsData.OurId IS NOT NULL';
                break;
            case 'other':
                typesToIncudeCondition = 'OurContractsData.OurId IS NULL';
                break;
            default:
                typesToIncudeCondition = '1';
        }
        //@deprecated
        const onlyOursContractsCondition = (searchParams.onlyOurs) ? 'OurContractsData.OurId IS NOT NULL' : '1';
        const isArchivedConditon = (isArchived) ? `mainContracts.Status=${Setup.ContractStatus.ARCHIVAL}` : 1;//'mainContracts.Status!="Archiwalny"';

        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);

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
            Admins.Name AS AdminName, 
            Admins.Surname AS AdminSurname, 
            Admins.Email AS AdminEmail, 
            Managers.Name AS ManagerName, 
            Managers.Surname AS ManagerSurname, 
            Managers.Email AS ManagerEmail, 
            relatedContracts.Id AS RelatedId, 
            relatedContracts.Name AS RelatedName, 
            relatedContracts.GdFolderId AS RelatedGdFolderId, 
            ContractTypes.Id AS MainContractTypeId, 
            ContractTypes.Name AS TypeName, 
            ContractTypes.IsOur AS TypeIsOur, 
            ContractTypes.Description AS TypeDescription
          FROM Contracts AS mainContracts
          LEFT JOIN OurContractsData ON OurContractsData.Id=mainContracts.id
          LEFT JOIN Contracts AS relatedContracts ON relatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=mainContracts.OurIdRelated)
          LEFT JOIN ContractTypes ON ContractTypes.Id = mainContracts.TypeId
          LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id
          LEFT JOIN Persons AS Managers ON OurContractsData.ManagerId = Managers.Id
          WHERE ${idCondition} 
            AND ${projectCondition} 
            AND ${onlyOursContractsCondition} 
            AND ${contractOurIdCondition} 
            AND ${isArchivedConditon}
            AND ${contractNameCondition}
            AND ${startDateFromCondition}
            AND ${startDateToCondition}
            AND ${endDateFromCondition}
            AND ${endDateToCondition}
            AND ${searchTextCondition}
            AND ${typeCondition}
            AND ${statusCondition}
            AND ${typesToIncudeCondition}
          ORDER BY mainContracts.ProjectOurId, OurContractsData.OurId DESC, mainContracts.Number`;
        try {
            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
            return (searchParams.onlyKeyData) ? this.processContractsResultKeyData(result, searchParams) : await this.processContractsResult(result, searchParams);
        } catch (err) {
            console.log(sql);
            throw (err);
        }
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(mainContracts.Name LIKE ? 
                          OR mainContracts.Number LIKE ? 
                          OR mainContracts.Alias LIKE ? 
                          OR OurContractsData.OurId LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    private static async processContractsResult(result: any[], initParamObject: any) {
        const newResult: Contract[] = [];
        let entitiesPerProject: any[] = [];

        if (initParamObject.projectId)
            entitiesPerProject = await this.getContractEntityAssociationsList(initParamObject);
        for (const row of result) {

            const contractors = entitiesPerProject.filter((item: any) =>
                item._contract.id == row.Id && item.contractRole == 'CONTRACTOR'
            );
            const engineers = entitiesPerProject.filter((item: any) =>
                item._contract.id == row.Id && item.contractRole == 'ENGINEER'
            );
            const employers = entitiesPerProject.filter((item: any) =>
                item._contract.id == row.Id && item.contractRole == 'EMPLOYER'
            );
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
                    gdFolderId: row.RelatedGdFolderId
                },
                _parent: {
                    ourId: row.ProjectOurId,
                },
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
                    email: row.ManagerEmail
                },
                _admin: {
                    id: row.AdminId,
                    name: row.AdminName,
                    surname: row.AdminSurname,
                    email: row.AdminEmail
                },
                _type: new ContractType({
                    id: row.MainContractTypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                    isOur: row.TypeIsOur
                }),
                _contractors: contractors.map((item: any) => item._entity),
                _engineers: engineers.map((item: any) => item._entity),
                _employers: employers.map((item: any) => item._entity),
                _lastUpdated: row.LastUpdated
            }
            let item;
            try {
                item = (row.TypeIsOur) ? new ContractOur(initParam) : new ContractOther(initParam);
            } catch (err) {
                console.log(initParam);
                throw (err);
            }
            newResult.push(item);
        }
        return newResult;
    }

    private static processContractsResultKeyData(result: any[], initParamObject: any): Contract[] {
        let newResult: Contract[] = [];

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
                    gdFolderId: row.RelatedGdFolderId
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
                    email: row.ManagerEmail
                },
                _admin: {
                    id: row.AdminId,
                    name: row.AdminName,
                    surname: row.AdminSurname,
                    email: row.AdminEmail
                },
                _type: {
                    id: row.TypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                    isOur: row.TypeIsOur
                },
            }
            const item = (row.TypeIsOur) ? new ContractOur(initParam) : new ContractOther(initParam);

            newResult.push(item);
        }
        return newResult;
    }

    static async getContractEntityAssociationsList(initParamObject: { projectId?: string, contractId?: string, isArchived?: string }) {
        let projectConditon = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        let contractConditon = (initParamObject && initParamObject.contractId) ? 'Contracts.Id="' + initParamObject.contractId + '"' : '1';
        const sql = 'SELECT  Contracts_Entities.ContractId, \n \t' +
            'Contracts_Entities.EntityId, \n \t' +
            'Contracts_Entities.ContractRole, \n \t' +
            'Entities.Name, \n \t' +
            'Entities.Address, \n \t' +
            'Entities.TaxNumber, \n \t' +
            'Entities.Www, \n \t' +
            'Entities.Email, \n \t' +
            'Entities.Phone, \n \t' +
            'Entities.Fax \n' +
            'FROM Contracts_Entities \n' +
            'JOIN Contracts ON Contracts_Entities.ContractId = Contracts.Id \n' +
            'JOIN Entities ON Contracts_Entities.EntityId=Entities.Id \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id \n' +
            'WHERE ' + projectConditon + ' AND ' + contractConditon + ' \n' +
            'ORDER BY Contracts_Entities.ContractRole, Entities.Name';
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return this.processContractEntityAssociations(result);
    }

    private static processContractEntityAssociations(result: any[]) {
        let newResult: any[] = [];

        for (const row of result) {
            const item = {
                contractRole: row.ContractRole,
                _contract: {
                    id: row.ContractId
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: row.Name,
                    address: row.Address,
                    taxNumber: row.TaxNumber,
                    www: row.Www,
                    email: row.Email,
                    phone: row.Phone,
                    fax: row.Fax
                })
            };

            newResult.push(item);
        }
        return newResult;

    }
}