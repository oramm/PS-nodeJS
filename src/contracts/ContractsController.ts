import mysql from "mysql";
import conn from "../config/dbConfig";
import ToolsDb from '../tools/ToolsDb'
import Contract from "./Contract";

export default class ContractsController {
    static getContractsList(initParamObject: any, cb: Function) {
        const projectCondition = (initParamObject && initParamObject.projectId) ? 'mainContracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractCondition = (initParamObject && initParamObject.contractId) ? 'mainContracts.Id=' + initParamObject.contractId : '1';
        const contractOurIdCondition = (initParamObject && initParamObject.contractOurId) ? 'OurContractsData.OurId="' + initParamObject.contractOurId + '"' : '1';

        const onlyOurContractsCondition = (initParamObject && initParamObject.onlyOur) ? 'OurContractsData.OurId IS NOT NULL' : '1';

        const sql = 'SELECT mainContracts.Id, \n \t' +
            'mainContracts.Alias, \n \t' +
            'mainContracts.Number, \n \t' +
            'mainContracts.Name, \n \t' +
            'mainContracts.ourIdRelated, \n \t' +
            'mainContracts.ProjectOurId, \n \t ' +
            'mainContracts.StartDate, \n \t' +
            'mainContracts.EndDate, \n \t' +
            'mainContracts.Value, \n \t' +
            'mainContracts.Comment, \n \t' +
            'mainContracts.Status, \n \t' +
            'mainContracts.GdFolderId, \n \t' +
            'mainContracts.MeetingProtocolsGdFolderId, \n \t' +
            'mainContracts.MaterialCardsGdFolderId, \n \t' +
            'OurContractsData.OurId, \n \t' +
            'OurContractsData.ManagerId, \n \t' +
            'OurContractsData.AdminId, \n \t' +
            'OurContractsData.ContractURL, \n \t' +
            'Admins.Name AS AdminName, \n \t' +
            'Admins.Surname AS AdminSurname, \n \t' +
            'Admins.Email AS AdminEmail, \n \t' +
            'Managers.Name AS ManagerName, \n \t' +
            'Managers.Surname AS ManagerSurname, \n \t' +
            'Managers.Email AS ManagerEmail, \n \t' +
            'relatedContracts.Id AS RelatedId, \n \t' +
            'relatedContracts.Name AS RelatedName, \n \t' +
            'relatedContracts.GdFolderId AS RelatedGdFolderId, \n \t' +
            'ContractTypes.Id AS TypeId, \n \t' +
            'ContractTypes.Name AS TypeName, \n \t' +
            'ContractTypes.IsOur AS TypeIsOur, \n \t' +
            'ContractTypes.Description AS TypeDescription \n' +
            'FROM Contracts AS mainContracts \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.Id=mainContracts.id \n' +
            'LEFT JOIN Contracts AS relatedContracts ON relatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=mainContracts.OurIdRelated) \n' +
            'LEFT JOIN ContractTypes ON ContractTypes.Id = mainContracts.TypeId \n' +
            'LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id \n' +
            'LEFT JOIN Persons AS Managers ON OurContractsData.ManagerId = Managers.Id \n' +
            'WHERE ' + projectCondition + ' AND ' + contractCondition + ' AND ' + onlyOurContractsCondition + ' AND ' + contractOurIdCondition + '\n' +
            'ORDER BY OurContractsData.OurId DESC, mainContracts.Number';

        ToolsDb.getQueryCallback(sql, cb)
    }

    static processContractsResult(result: [any]): [Contract?] {
        let newResult: [Contract?] = [];

        for (const row of result) {
            const item = new Contract({
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
                contractUrl: row.ContractURL,
                _type: {
                  id: row.TypeId,
                  name: row.TypeName,
                  description: row.TypeDescription,
                  isOur: row.TypeIsOur
                },
              });

            newResult.push(item);
        }
        return newResult;
    }
}