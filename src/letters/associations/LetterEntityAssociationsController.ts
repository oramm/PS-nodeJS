import Case from '../../contracts/milestones/cases/Case';
import Entity from '../../entities/Entity';
import ToolsDb from '../../tools/ToolsDb';
import { LetterData } from '../../types/types';
import Letter from '../Letter';
import LetterEntity from './LetterEntity';

export default class LetterEntityAssociationsController {
    static async getLetterEntityAssociationsList(initParamObject: any) {
        const projectConditon =
            initParamObject && initParamObject.projectId
                ? 'Projects.OurId="' + initParamObject.projectId + '"'
                : '1';
        const contractConditon =
            initParamObject && initParamObject.contractctId
                ? 'Contracts.Id="' + initParamObject.contractctId + '"'
                : '1';
        const milestoneConditon =
            initParamObject && initParamObject.milestonetId
                ? 'Milestones.Id="' + initParamObject.milestoneId + '"'
                : '1';

        const sql = `SELECT  Letters_Entities.LetterId,
                Letters_Entities.EntityId,
                Letters_Entities.LetterRole,
                Entities.Name AS EntityName,
                Entities.Address AS EntityAddress,
                Entities.TaxNumber AS EntityTaxNumber,
                Entities.Www AS EntityWww,
                Entities.Email AS EntityEmail,
                Entities.Phone AS EntityPhone,
                Entities.Fax AS EntityFax
            FROM Letters_Entities
            JOIN Letters ON Letters_Entities.LetterId = Letters.Id
            JOIN Projects ON Letters.ProjectId = Projects.Id
            JOIN Contracts ON Projects.OurId = Contracts.ProjectOurId
            JOIN Milestones ON Milestones.ContractId = Contracts.Id
            JOIN Entities ON Letters_Entities.EntityId=Entities.Id
            WHERE ${projectConditon} 
              AND ${contractConditon} 
              AND ${milestoneConditon}
            GROUP BY LetterId, EntityId
            ORDER BY Letters_Entities.LetterRole, EntityName`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLetterEntityAssociationsResult(result);
    }

    static processLetterEntityAssociationsResult(
        result: any[]
    ): LetterEntity[] {
        let newResult: LetterEntity[] = [];

        for (const row of result) {
            const item = new LetterEntity({
                letterRole: row.LetterRole,
                _letter: <LetterData>{
                    id: row.LetterId,
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: ToolsDb.sqlToString(row.EntityName),
                    address: ToolsDb.sqlToString(row.EntityAddress),
                    taxNumber: row.EntityTaxNumber,
                    www: row.EntityWww,
                    email: row.EntityEmail,
                    phone: row.EntityPhone,
                    fax: row.EntityFax,
                }),
            });
            newResult.push(item);
        }
        return newResult;
    }
}
