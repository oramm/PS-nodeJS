import mysql from "mysql";
import Tools from "../tools/Tools";
import ToolsDate from "../tools/ToolsDate";
import ToolsDb from '../tools/ToolsDb'
import LetterCaseAssociationsController from "./associations/LetterCaseAssociationsController";
import LetterEntityAssociationsController from "./associations/LetterEntityAssociationsController";
import IncomingLetter from "./IncomingLetter";
import Letter from "./Letter";
import OurLetter from "./OurLetter";
import OurOldTypeLetter from "./OurOldTypeLetter";


export default class LettersController {
    static async getLettersList(initParamObject: any) {
        const projectConditon = (initParamObject && initParamObject.projectId) ? 'Projects.OurId="' + initParamObject.projectId + '"' : '1';
        const milestoneConditon = (initParamObject && initParamObject.milestoneId) ? 'Milestones.Id=' + initParamObject.milestoneId : '1';
        const contractConditon = (initParamObject && initParamObject.contractId) ? 'Contracts.Id=' + initParamObject.contractId : '1';
        initParamObject.endDate = (!initParamObject.endDate) ? initParamObject.endDate = 'CURDATE()' : `"${ToolsDate.dateDMYtoYMD(initParamObject.endDate)}"`;

        const dateCondition = (initParamObject && initParamObject.startDate) ? `Letters.CreationDate BETWEEN "${ToolsDate.dateDMYtoYMD(initParamObject.startDate)}" AND DATE_ADD(${initParamObject.endDate}, INTERVAL 1 DAY)` : '1';

        const sql = 'SELECT  Letters.Id, \n \t' +
            'Letters.IsOur, \n \t' +
            'Letters.Number, \n \t' +
            'Letters.Description, \n \t' +
            'Letters.CreationDate, \n \t' +
            'Letters.RegistrationDate, \n \t' +
            'Letters.DocumentGdId, \n \t' +
            'Letters.FolderGdId, \n \t' +
            'Letters.LetterFilesCount, \n \t' +
            'Letters.LastUpdated, \n \t' +
            'Projects.Id AS ProjectId, \n \t' +
            'Projects.OurId AS ProjectOurId, \n \t' +
            'Projects.GdFolderId AS ProjectGdFolderId, \n \t' +
            'Projects.LettersGdFolderId, \n \t' +
            'Persons.Id AS EditorId, \n \t' +
            'Persons.Name AS EditorName, \n \t' +
            'Persons.Surname AS EditorSurname \n' +
            'FROM Letters \n' +
            'JOIN Letters_Cases ON Letters_Cases.LetterId=Letters.id \n' +
            'JOIN Cases ON Letters_Cases.CaseId=Cases.Id \n' +
            'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
            'JOIN Contracts ON Contracts.Id=Milestones.ContractId \n' +
            'JOIN Projects ON Letters.ProjectId=Projects.Id \n' +
            'JOIN Persons ON Letters.EditorId=Persons.Id \n' +
            'WHERE ' + projectConditon + ' AND ' + contractConditon + ' AND ' + milestoneConditon + ' AND ' + dateCondition + '\n' +
            'GROUP BY Letters.Id \n' +
            'ORDER BY Letters.RegistrationDate, Letters.CreationDate';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLettersResult(result, initParamObject);


    }

    static async processLettersResult(result: any[], initParamObject: any) {
        let newResult: Letter[] = [];
        let [_casesAssociationsPerProject, _letterEntitiesPerProject] = await Promise.all([
            LetterCaseAssociationsController.getLetterCaseAssociationsList(initParamObject),
            LetterEntityAssociationsController.getLetterEntityAssociationsList(initParamObject)
        ]);
        for (const row of result) {
            const _casesAssociationsPerLetter = _casesAssociationsPerProject.filter((item: any) => item.letterId == row.Id);
            const _letterEntitiesMainPerLetter = _letterEntitiesPerProject.filter((item: any) => item.letterId == row.Id && item.letterRole == 'MAIN');
            const _letterEntitiesCcPerLetter = _letterEntitiesPerProject.filter((item: any) => item.letterId == row.Id && item.letterRole == 'Cc');
            const initParam = {
                id: row.Id,
                isOur: row.IsOur,
                number: row.Number,
                description: ToolsDb.sqlToString(row.Description),
                creationDate: row.CreationDate,
                registrationDate: row.RegistrationDate,
                documentGdId: row.DocumentGdId,
                folderGdId: row.FolderGdId,
                letterFilesCount: row.LetterFilesCount,
                _lastUpdated: row.LastUpdated,
                _project: {
                    id: row.ProjectId,
                    ourId: row.ProjectOurId,
                    gdFolderId: row.ProjectGdFolderId,
                    lettersGdFolderId: row.LettersGdFolderId,
                },
                _cases: _casesAssociationsPerLetter.map((item: any) => item._case),
                _entitiesMain: _letterEntitiesMainPerLetter.map((item: any) => item._entity),
                _entitiesCc: _letterEntitiesCcPerLetter.map((item: any) => item._entity),
                _editor: {
                    id: row.EditorId,
                    name: row.EditorName,
                    surname: row.EditorSurname,
                }
            }
            let item: IncomingLetter | OurLetter | OurOldTypeLetter;
            if (initParam.isOur) {
                if (initParam.id == initParam.number)
                    item = new OurLetter(initParam);
                else
                    item = new OurOldTypeLetter(initParam);
            }
            else
                item = new IncomingLetter(initParam);
            newResult.push(item);
        }
        return newResult;
    }
    /** tworzy obiekt odpowiedniej podklasy Letter na podstawie atrybutów */
    static createProperLetter(initParam: any) {
        let item: OurLetter | OurOldTypeLetter | IncomingLetter;
        if (initParam.isOur) {
            if (initParam.id == initParam.number)
                item = new OurLetter(initParam);
            else
                item = new OurOldTypeLetter(initParam);
        }
        else
            item = new IncomingLetter(initParam);
        return item;
    }
}