import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import ContractEntity from './ContractEntity';
import Entity from '../entities/Entity';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ToolsDb from '../tools/ToolsDb';
import { EntityData } from '../types/types';

/**
 * Repository dla asocjacji Contract-Entity
 * Tabela: Contracts_Entities
 */
export default class ContractEntityRepository extends BaseRepository<ContractEntity> {
    constructor() {
        super('Contracts_Entities');
    }

    /**
     * Mapuje wiersz z bazy danych na obiekt ContractEntity
     */
    protected mapRowToModel(row: any): ContractEntity {
        return new ContractEntity({
            contractRole: row.ContractRole,
            _contract: {
                id: row.ContractId,
            },
            _entity: new Entity({
                id: row.EntityId,
                name: row.Name,
                address: row.Address,
                taxNumber: row.TaxNumber,
                www: row.Www,
                email: row.Email,
                phone: row.Phone,
            }),
        });
    }

    /**
     * Wyszukuje asocjacje Contract-Entity
     */
    async find(params?: {
        contractId?: number;
        projectId?: string;
    }): Promise<ContractEntity[]> {
        const projectCondition = params?.projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [params.projectId])
            : '1';

        const contractCondition = params?.contractId
            ? mysql.format('Contracts.Id = ?', [params.contractId])
            : '1';

        const sql = `SELECT
            Contracts_Entities.ContractId,
            Contracts_Entities.EntityId,
            Contracts_Entities.ContractRole,
            Entities.Name,
            Entities.Address,
            Entities.TaxNumber,
            Entities.Www,
            Entities.Email,
            Entities.Phone
        FROM Contracts_Entities
        JOIN Contracts ON Contracts_Entities.ContractId = Contracts.Id
        JOIN Entities ON Contracts_Entities.EntityId = Entities.Id
        WHERE ${projectCondition} AND ${contractCondition}
        ORDER BY Contracts_Entities.ContractRole, Entities.Name`;

        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    /**
     * Dodaje asocjacje Entity-Contract do bazy danych
     * @param contract - Kontrakt (musi mieć id)
     * @param entities - Lista encji do powiązania (EntityData lub Entity)
     * @param role - Rola encji (CONTRACTOR, ENGINEER, EMPLOYER)
     * @param conn - Połączenie do bazy danych (dla transakcji)
     */
    async addAssociations(
        contract: { id?: number },
        entities: EntityData[] | Entity[],
        role: 'CONTRACTOR' | 'ENGINEER' | 'EMPLOYER',
        conn: mysql.PoolConnection
    ): Promise<void> {
        if (!contract.id)
            throw new Error('Contract ID is required for associations');
        for (const entity of entities) {
            const association = new ContractEntity({
                _contract: { id: contract.id },
                _entity: entity,
                contractRole: role,
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
}
