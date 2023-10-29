
import { RowDataPacket } from "mysql2";
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb'
import ContractType from "./ContractType";

export type ContractTypesSearchParams = {
    status?: string,
}

export default class ContractTypesController {
    static async getContractTypesList(initParamObject: ContractTypesSearchParams[] = []) {

        const sql = `SELECT ContractTypes.Id,
                        ContractTypes.Name,
                        ContractTypes.Description,
                        ContractTypes.IsOur,
                        ContractTypes.Status
                    FROM ContractTypes
                    WHERE ${ToolsDb.makeOrGroupsConditions(initParamObject, this.makeAndConditions.bind(this))}`;

        const result = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processContractTypesResult(result);
    }

    static makeAndConditions(searchParams: ContractTypesSearchParams) {
        const { status } = searchParams;
        const statusCondition = status
            ? mysql.format(`ContractTypes.Status=?`, [status])
            : '1';

        return `${statusCondition}`;
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