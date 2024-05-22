import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import ContractRange from './ContractRange';
import { ContractRangeData } from '../../types/types';

export type ContractRangesSearchParams = {
    searchText?: string;
    id?: number;
    description?: string;
    name?: string;
};

export default class ContractRangesController {
    static async getContractRangesList(
        orConditions: ContractRangesSearchParams[] = []
    ) {
        const sql = `SELECT ContractRanges.Id, 
            ContractRanges.Name, 
            ContractRanges.Description
          FROM ContractRanges
          WHERE ${ToolsDb.makeOrGroupsConditions(
              orConditions,
              this.makeAndConditions.bind(this)
          )}
          ORDER BY ContractRanges.Name ASC`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            return await this.processContractRangesResult(
                result,
                orConditions[0]
            );
        } catch (err) {
            console.log(sql);
            throw err;
        }
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(ContractRanges.Name LIKE ?
                OR ContractRanges.Description LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: ContractRangesSearchParams) {
        const conditions = [];

        if (searchParams.id) {
            conditions.push(
                mysql.format(`ContractRanges.Id = ?`, [searchParams.id])
            );
        }
        if (searchParams.name) {
            conditions.push(
                mysql.format(`ContractRanges.Name = ?`, [searchParams.name])
            );
        }
        if (searchParams.description) {
            conditions.push(
                mysql.format(`ContractRanges.Description = ?`, [
                    searchParams.description,
                ])
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private static async processContractRangesResult(
        result: any[],
        initParamObject: ContractRangesSearchParams
    ) {
        const newResult: ContractRange[] = [];

        for (const row of result) {
            let item: ContractRange;
            item = new ContractRange({
                id: row.Id,
                name: ToolsDb.sqlToString(row.Name),
                description: ToolsDb.sqlToString(row.Description),
            });

            newResult.push(item);
        }
        return newResult;
    }
}
