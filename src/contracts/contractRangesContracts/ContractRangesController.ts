import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import {
    ContractRangeData,
    ContractData,
    ContractRangePerContractData,
} from '../../types/types';

type ContractRangesContractsSearchParams = {
    contractRangeId?: number;
    _contractRange?: ContractRangeData;
    _contract?: ContractData;
    contractId?: number;
    searchText?: string;
};

export default class ContractRangesContractsController {
    static async getContractRangesContractsList(
        orConditions: ContractRangesContractsSearchParams[] = []
    ) {
        const sql = `SELECT ContractRangesContracts.ContractRangeId,
            ContractRangesContracts.ContractId,
            ContractRangesContracts.AssociationComment,
            ContractRanges.Id AS ContractRangeId,
            ContractRanges.Name AS ContractRangeName,
            ContractRanges.Description AS ContractRangeDescription
        FROM ContractRangesContracts
        JOIN ContractRanges ON ContractRangesContracts.ContractRangeId = ContractRanges.Id
        JOIN Contracts ON ContractRangesContracts.ContractId = Contracts.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY ContractRanges.Name ASC, Contracts.Name ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processContractRangesContractsResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(ContractRanges.Name LIKE ? OR Contracts.Name LIKE ? OR ContractRangesContracts.AssociationComment LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(
        searchParams: ContractRangesContractsSearchParams
    ) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        const contractRangeId =
            searchParams.contractRangeId || searchParams._contractRange?.id;
        if (contractRangeId) {
            conditions.push(
                mysql.format(`ContractRangesContracts.ContractRangeId = ?`, [
                    contractRangeId,
                ])
            );
        }

        const contractId =
            searchParams.contractId || searchParams._contract?.id;
        if (contractId) {
            conditions.push(
                mysql.format(`ContractRangesContracts.ContractId = ?`, [
                    contractId,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }
    static processContractRangesContractsResult(
        result: any[]
    ): ContractRangePerContractData[] {
        let newResult: ContractRangePerContractData[] = [];

        for (const row of result) {
            const item: ContractRangePerContractData = {
                contractRangeId: row.ContractRangeId,
                contractId: row.ContractId,
                associationComment: row.AssociationComment,
                _contractRange: {
                    id: row.ContractRangeId,
                    name: row.ContractRangeName,
                    description: row.ContractRangeDescription,
                },
            };
            newResult.push(item);
        }
        return newResult;
    }
}
