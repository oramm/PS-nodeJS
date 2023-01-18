import mysql from "mysql";
import Entity from "../entities/Entity";
import Person from "../persons/Person";
import Project from "../projects/Project";
import ToolsDb from '../tools/ToolsDb'
import Contract from "./Contract";
import ContractOther from "./ContractOther";
import ContractOur from "./ContractOur";
import ContractType from "./contractTypes/ContractType";

export default class ContractsController {
    static async getContractsList(initParamObject: {
        projectId?: string,
        contractId?: number
        contractOurId?: string,
        onlyOur?: boolean,
        isArchived?: boolean,
        onlyKeyData?: boolean
    }) {
        const projectCondition = (initParamObject && initParamObject.projectId) ? 'mainContracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractCondition = (initParamObject && initParamObject.contractId) ? 'mainContracts.Id=' + initParamObject.contractId : '1';
        const contractOurIdCondition = (initParamObject && initParamObject.contractOurId) ? 'OurContractsData.OurId="' + initParamObject.contractOurId + '"' : '1';

        const onlyOurContractsCondition = (initParamObject && initParamObject.onlyOur) ? 'OurContractsData.OurId IS NOT NULL' : '1';
        const isArchivedConditon = (initParamObject && initParamObject.isArchived) ? 'mainContracts.Status="Archiwalny"' : 'mainContracts.Status!="Archiwalny"';

        const sql = `SELECT mainContracts.Id, 
        mainContracts.Alias, 
        mainContracts.Number, 
        mainContracts.Name, 
        mainContracts.OurIdRelated, 
        mainContracts.ProjectOurId,
        mainContracts.StartDate, 
        mainContracts.EndDate, 
        mainContracts.Value, 
        mainContracts.Comment, 
        mainContracts.Status, 
        mainContracts.GdFolderId, 
        mainContracts.MeetingProtocolsGdFolderId, 
        mainContracts.MaterialCardsGdFolderId, 
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
        ContractTypes.Id AS TypeId, 
        ContractTypes.Name AS TypeName, 
        ContractTypes.IsOur AS TypeIsOur, 
        ContractTypes.Description AS TypeDescription
      FROM Contracts AS mainContracts
      LEFT JOIN OurContractsData ON OurContractsData.Id=mainContracts.id
      LEFT JOIN Contracts AS relatedContracts ON relatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=mainContracts.OurIdRelated)
      LEFT JOIN ContractTypes ON ContractTypes.Id = mainContracts.TypeId
      LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id
      LEFT JOIN Persons AS Managers ON OurContractsData.ManagerId = Managers.Id
      WHERE ${projectCondition} AND ${contractCondition} AND ${onlyOurContractsCondition} AND ${contractOurIdCondition} AND ${isArchivedConditon}
      ORDER BY OurContractsData.OurId DESC, mainContracts.Number`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return (initParamObject.onlyKeyData) ? this.processContractsResultKeyData(result, initParamObject) : this.processContractsResult(result, initParamObject);
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
                projectId: row.ProjectOurId,
                startDate: row.StartDate,
                endDate: row.EndDate,
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
                    id: row.TypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                    isOur: row.TypeIsOur
                }),
                _contractors: contractors.map((item: any) => item._entity),
                _engineers: engineers.map((item: any) => item._entity),
                _employers: employers.map((item: any) => item._entity)
            }
            const item = (row.TypeIsOur) ? new ContractOur(initParam) : new ContractOther(initParam);
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