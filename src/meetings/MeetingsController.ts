import mysql from "mysql";
import Tools from "../tools/Tools";
import ToolsDb from '../tools/ToolsDb'
import Meeting from "./Meeting";

export default class MeetingsController {
    static async getMeetingsList(initParamObject: any) {
        const projectConditon = (initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractConditon = (initParamObject.contractId) ? 'Meetings.ContractId=' + initParamObject.contractId : '1';

        const sql = 'SELECT  Meetings.Id, \n \t' +
            'Meetings.Name, \n \t' +
            'Meetings.Description, \n \t' +
            'Meetings.Date, \n \t' +
            'Meetings.ProtocolGdId, \n \t' +
            'Meetings.Location, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'Contracts.GdFolderId AS ContractGdFolderId, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'ContractTypes.Id AS ContractTypeId, \n \t' +
            'ContractTypes.Name AS ContractTypeName, \n \t' +
            'ContractTypes.IsOur AS ContractTypeIsOur, \n \t' +
            'ContractTypes.Id AS ContractTypeDescription, \n \t' +
            'Projects.OurId AS ProjectOurId, \n \t' +
            'Projects.Name AS ProjectName, \n \t' +
            'Projects.GdFolderId AS ProjectGdFolderId \n' +
            'FROM Meetings \n' +
            'JOIN Contracts ON Contracts.Id=Meetings.ContractId \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.id \n' +
            'JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId \n' +
            'JOIN Projects ON Projects.OurId=Contracts.ProjectOurId \n' +
            'WHERE ' + projectConditon + ' AND ' + contractConditon;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMeetingsResult(result);


    }

    static processMeetingsResult(result: any[]): [Meeting?] {
        let newResult: [Meeting?] = [];

        for (const row of result) {
            var item = new Meeting({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                date: row.Date,
                protocolGdId: row.ProtocolGdId,
                location: row.Location,
                _contract: {
                    id: row.ContractId,
                    number: row.ContractNumber,
                    name: ToolsDb.sqlToString(row.ContractName),
                    gdFolderId: row.ContractGdFolderId,
                    ourId: row.ContractOurId,
                    _parent: {
                        ourId: row.ProjectOurId,
                        name: row.ProjectName,
                        gdFolderId: row.ProjectGdFolderId
                    },
                    _type: {
                        id: row.ContractTypeId,
                        name: row.ContractTypeName,
                        description: row.ContractTypeDescription,
                        isOur: row.ContractTypeIsOur
                    }
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}