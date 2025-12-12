import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import ContractRangeContract from './ContractRangeContract';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import ToolsDb from '../../tools/ToolsDb';
import {
    ContractRangePerContractData,
    ContractRangeData,
    ContractData,
} from '../../types/types';

export type ContractRangesContractsSearchParams = {
    contractRangeId?: number;
    _contractRange?: ContractRangeData;
    _contract?: ContractData;
    contractId?: number;
    searchText?: string;
};

/**
 * Repository dla asocjacji Contract-ContractRange
 * Tabela: ContractRangesContracts
 */
export default class ContractRangeContractRepository extends BaseRepository<ContractRangeContract> {
    constructor() {
        super('ContractRangesContracts');
    }

    /**
     * Mapuje wiersz z bazy danych na obiekt ContractRangeContract
     */
    protected mapRowToModel(row: any): ContractRangeContract {
        return new ContractRangeContract({
            contractRangeId: row.ContractRangeId,
            contractId: row.ContractId,
            _contractRange: {
                id: row.ContractRangeId,
                name: row.ContractRangeName,
                description: row.ContractRangeDescription,
            },
            associationComment: row.AssociationComment,
        });
    }

    /**
     * Wyszukuje asocjacje Contract-ContractRange z obsługą orConditions
     * @param orConditions - tablica warunków łączonych przez OR
     */
    async find(
        orConditions: ContractRangesContractsSearchParams[] = []
    ): Promise<ContractRangeContract[]> {
        const sql = `SELECT ContractRangesContracts.ContractRangeId,
            ContractRangesContracts.ContractId,
            ContractRangesContracts.AssociationComment,
            ContractRanges.Id AS ContractRangeId,
            ContractRanges.Name AS ContractRangeName,
            ContractRanges.Description AS ContractRangeDescription
        FROM ContractRangesContracts
        JOIN ContractRanges ON ContractRangesContracts.ContractRangeId = ContractRanges.Id
        JOIN Contracts ON ContractRangesContracts.ContractId = Contracts.Id
        WHERE ${this.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY ContractRanges.Name ASC, Contracts.Name ASC`;

        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    /**
     * Tworzy warunek wyszukiwania tekstu
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(ContractRanges.Name LIKE ? OR Contracts.Name LIKE ? OR ContractRangesContracts.AssociationComment LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        return conditions.join(' AND ');
    }

    /**
     * Tworzy warunki AND dla pojedynczego zestawu parametrów wyszukiwania
     */
    private makeAndConditions(
        searchParams: ContractRangesContractsSearchParams
    ): string {
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

    /**
     * Dodaje asocjacje ContractRange-Contract do bazy danych
     * @param contract - Kontrakt
     * @param ranges - Lista zakresów kontraktu
     * @param conn - Połączenie do bazy danych (dla transakcji)
     */
    async addAssociations(
        contract: ContractOur | ContractOther,
        ranges: ContractRangePerContractData[],
        conn: mysql.PoolConnection
    ): Promise<void> {
        for (const range of ranges) {
            const association = new ContractRangeContract({
                contractId: contract.id!,
                contractRangeId: range._contractRange.id!,
                _contractRange: range._contractRange,
                associationComment: range.associationComment,
            });
            await ToolsDb.addInDb(this.tableName, association, conn);
        }
    }

    /**
     * Usuwa wszystkie asocjacje dla kontraktu
     * @param contractId - ID kontraktu
     * @param conn - Połączenie do bazy danych (dla transakcji)
     */
    async deleteByContractId(
        contractId: number,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const sql = `DELETE FROM ${this.tableName} WHERE ContractId = ?`;
        await ToolsDb.executePreparedStmt(sql, [contractId], undefined, conn);
    }

    /**
     * Edytuje asocjacje ContractRange-Contract (usuwa stare i dodaje nowe)
     * @param contract - Kontrakt
     * @param ranges - Lista zakresów kontraktu
     * @param conn - Połączenie do bazy danych (dla transakcji)
     */
    async editAssociations(
        contract: ContractOur | ContractOther,
        ranges: ContractRangePerContractData[],
        conn: mysql.PoolConnection
    ): Promise<void> {
        // Usuń stare asocjacje
        await this.deleteByContractId(contract.id!, conn);

        // Dodaj nowe asocjacje
        if (ranges?.length) {
            await this.addAssociations(contract, ranges, conn);
        }
    }
}
