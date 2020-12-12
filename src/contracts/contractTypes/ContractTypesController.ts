
import Tools from "../../tools/Tools";
import ToolsDb from '../../tools/ToolsDb'
import ContractType from "./ContractType";

export default class ContractTypesController {
    static async getContractTypesList(initParamObject: any) {
        const statusCondition = (initParamObject && initParamObject.status) ? 'ContractTypes.Status="' + initParamObject.status + '"' : '1';
        const sql = 'SELECT  ContractTypes.Id, \n \t' +
            'ContractTypes.Name, \n \t' +
            'ContractTypes.Description, \n \t' +
            'ContractTypes.IsOur, \n \t' +
            'ContractTypes.Status \n' +
            'FROM ContractTypes \n' +
            'WHERE ' + statusCondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processContractTypesResult(result);
    }

    static processContractTypesResult(result: any[]): [ContractType?] {
        let newResult: [ContractType?] = [];

        for (const row of result) {
            var item = new ContractType({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                isOur: row.IsOur,
                status: row.Status,
            });
            newResult.push(item);
        }
        return newResult;
    }
}