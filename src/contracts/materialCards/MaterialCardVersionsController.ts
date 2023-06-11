import mysql from 'mysql2/promise';
import ToolsDb from "../../tools/ToolsDb";


import MaterialCardVersion from "./MaterialCardVersion";

export default class MaterialCardVersionsController {
    static async getMaterialCardVersionsList(initParamObject: any) {
        const contractConditon = (initParamObject.contractId) ? 'MaterialCards.ContractId="' + initParamObject.contractId + '"' : '1';

        const sql = 'SELECT MaterialCardVersions.Id, \n \t' +
            'MaterialCardVersions.Status, \n \t' +
            'MaterialCardVersions.ParentId, \n \t' +
            'MaterialCardVersions.LastUpdated, \n \t' +
            'Editors.Id AS EditorId, \n \t' +
            'Editors.Name AS EditorName, \n \t' +
            'Editors.Surname AS EditorSurname, \n \t' +
            'Editors.Email AS EditorEmail \n' +
            'FROM MaterialCardVersions \n' +
            'JOIN MaterialCards ON MaterialCards.Id=MaterialCardVersions.ParentId \n' +
            'JOIN Persons AS Editors ON Editors.Id=MaterialCardVersions.EditorId \n' +
            'WHERE ' + contractConditon + '\n' +
            'ORDER BY MaterialCardVersions.Id DESC';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMaterialCardVersionsResult(result);
    }

    static processMaterialCardVersionsResult(result: any[]): [MaterialCardVersion?] {
        let newResult: [MaterialCardVersion?] = [];
        for (const row of result) {
            var item = new MaterialCardVersion({
                id: row.Id,
                status: row.Status,
                _lastUpdated: row.LastUpdated,
                parentId: row.ParentId,
                //ostatni edytujący
                _editor: {
                    id: row.EditorId,
                    name: row.EditorName,
                    surname: row.EditorSurname,
                    email: row.EditorEmail
                },
            });
            newResult.push(item);
        }
        return newResult;
    }
}