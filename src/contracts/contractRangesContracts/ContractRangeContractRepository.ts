import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import ContractRangeContract from './ContractRangeContract';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import ToolsDb from '../../tools/ToolsDb';
import { ContractRangePerContractData } from '../../types/types';

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
     * Wyszukuje asocjacje Contract-ContractRange
     */
    async find(params?: {
        contractId?: number;
        contractRangeId?: number;
    }): Promise<ContractRangeContract[]> {
        const contractCondition = params?.contractId
            ? mysql.format('ContractRangesContracts.ContractId = ?', [
                  params.contractId,
              ])
            : '1';

        const rangeCondition = params?.contractRangeId
            ? mysql.format('ContractRangesContracts.ContractRangeId = ?', [
                  params.contractRangeId,
              ])
            : '1';

        const sql = `SELECT
            ContractRangesContracts.ContractId,
            ContractRangesContracts.ContractRangeId,
            ContractRangesContracts.AssociationComment,
            ContractRanges.Name AS ContractRangeName,
            ContractRanges.Description AS ContractRangeDescription
        FROM ContractRangesContracts
        JOIN ContractRanges ON ContractRangesContracts.ContractRangeId = ContractRanges.Id
        WHERE ${contractCondition} AND ${rangeCondition}
        ORDER BY ContractRanges.Name`;

        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => this.mapRowToModel(row));
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
