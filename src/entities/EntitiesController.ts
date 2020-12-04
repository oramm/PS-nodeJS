import ToolsDb from '../tools/ToolsDb'
import Entity from "./Entity";

export default class EntitiesController {
    static getEntitiesList(initParamObject: any, cb: Function) {
        var projectConditon = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const idCondition = (initParamObject && initParamObject.id) ? 'Entities.Id=' + initParamObject.id : '1';

        var sql = 'SELECT  Entities.Id, \n \t' +
            'Entities.Name, \n \t' +
            'Entities.Address, \n \t' +
            'Entities.TaxNumber, \n \t' +
            'Entities.Www, \n \t' +
            'Entities.Email, \n \t' +
            'Entities.Phone, \n \t' +
            'Entities.Fax \n' +
            'FROM Entities \n' +
            'WHERE ' + projectConditon + ' AND ' + idCondition + '\n' +
            'ORDER BY Entities.Name';

        ToolsDb.getQueryCallback(sql, cb)
    }

    static processEntitiesResult(result: [any]): [Entity?] {
        let newResult: [Entity?] = [];

        for (const row of result) {
            var item = new Entity({
                id: row.Id,
                name: row.Name,
                address: row.Address,
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