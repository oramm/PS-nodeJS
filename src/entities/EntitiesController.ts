import ToolsDb from '../tools/ToolsDb'
import Entity from "./Entity";

export default class EntitiesController {
    static async getEntitiesList(initParamObject: {
        projectId?: string,
        id?: number
        name?: string
    } = {}) {
        const projectConditon = (initParamObject.projectId) ? `Contracts.ProjectOurId="${initParamObject.projectId}"` : '1';
        const idCondition = (initParamObject.id) ? `Entities.Id=${initParamObject.id}` : '1';
        const nameCondition = (initParamObject.name) ? `Entities.Name LIKE "%${initParamObject.name}%"` : '1';

        const sql = `SELECT  Entities.Id,
                Entities.Name,
                Entities.Address,
                Entities.TaxNumber,
                Entities.Www,
                Entities.Email,
                Entities.Phone,
                Entities.Fax
            FROM Entities
            WHERE ${projectConditon} 
                AND ${idCondition}
                AND ${nameCondition}
            ORDER BY Entities.Name;`

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processEntitiesResult(result);
    }

    static processEntitiesResult(result: any[]): [Entity?] {
        let newResult: [Entity?] = [];

        for (const row of result) {
            const item = new Entity({
                id: row.Id,
                name: ToolsDb.sqlToString(row.Name),
                address: ToolsDb.sqlToString(row.Address),
                taxNumber: row.TaxNumber,
                www: row.Www,
                email: row.Email,
                phone: row.Phone,
                fax: row.Fax
            });
            newResult.push(item);
        }
        return newResult;
    }
}