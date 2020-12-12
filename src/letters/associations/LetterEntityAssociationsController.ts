import Case from "../../contracts/milestones/cases/Case";
import Entity from "../../entities/Entity";
import ToolsDb from "../../tools/ToolsDb";
import LetterEntity from "./LetterEntity";


export default class LetterEntityAssociationsController {
    static async getLetterEntityAssociationsList(initParamObject: any) {
        const projectConditon = (initParamObject && initParamObject.projectId) ? 'Projects.OurId="' + initParamObject.projectId + '"' : '1';
        const contractConditon = (initParamObject && initParamObject.contractctId) ? 'Contracts.Id="' + initParamObject.contractctId + '"' : '1';
        const milestoneConditon = (initParamObject && initParamObject.milestonetId) ? 'Milestones.Id="' + initParamObject.milestoneId + '"' : '1';

        const sql = 'SELECT  Letters_Entities.LetterId, \n \t' +
            'Letters_Entities.EntityId, \n \t' +
            'Letters_Entities.LetterRole, \n \t' +
            'Entities.Name AS EntityName, \n \t' +
            'Entities.Address AS EntityAddress, \n \t' +
            'Entities.TaxNumber AS EntityTaxNumber, \n \t' +
            'Entities.Www AS EntityWww, \n \t' +
            'Entities.Email AS EntityEmail, \n \t' +
            'Entities.Phone AS EntityPhone, \n \t' +
            'Entities.Fax AS EntityFax \n' +
            'FROM Letters_Entities \n' +
            'JOIN Letters ON Letters_Entities.LetterId = Letters.Id \n' +
            'JOIN Projects ON Letters.ProjectId = Projects.Id \n' +
            'JOIN Contracts ON Projects.OurId = Contracts.ProjectOurId \n' +
            'JOIN Milestones ON Milestones.ContractId = Contracts.Id \n' +
            'JOIN Entities ON Letters_Entities.EntityId=Entities.Id \n' +
            'WHERE ' + projectConditon + ' AND ' + contractConditon + ' AND ' + milestoneConditon + ' \n' +
            'GROUP BY LetterId, EntityId \n' +
            'ORDER BY Letters_Entities.LetterRole, EntityName';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLetterEntityAssociationsResult(result);


    }

    static processLetterEntityAssociationsResult(result: any[]): [LetterEntity?] {
        let newResult: [LetterEntity?] = [];

        for (const row of result) {
            const item = new LetterEntity({
                letterRole: row.LetterRole,
                _letter: {
                    id: row.LetterId
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: row.EntityName,
                    address: row.EntityAddress,
                    taxNumber: row.EntityTaxNumber,
                    www: row.EntityWww,
                    email: row.EntityEmail,
                    phone: row.EntityPhone,
                    fax: row.EntityFax
                })
            });
            newResult.push(item);
        }
        return newResult;
    }
}