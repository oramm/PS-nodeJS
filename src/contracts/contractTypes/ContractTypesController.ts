
import { RowDataPacket } from "mysql2";
import Tools from "../../tools/Tools";
import ToolsDb from '../../tools/ToolsDb'
import ContractType from "./ContractType";

export default class ContractTypesController {
    static async getContractTypesList(initParamObject: { status?: string } = {}) {
        const { status } = initParamObject;
        const statusCondition = status ? `ContractTypes.Status="${status}"` : "1";

        const sql = `SELECT ContractTypes.Id,
                        ContractTypes.Name,
                        ContractTypes.Description,
                        ContractTypes.IsOur,
                        ContractTypes.Status
                    FROM ContractTypes
                    WHERE ${statusCondition}`;

        const result = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processContractTypesResult(result);
    }

    static processContractTypesResult(result: RowDataPacket[]): ContractType[] {
        let newResult: ContractType[] = [];
        for (const row of result) {
            const item = new ContractType({
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