import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import ContractEntity from './ContractEntity';
import Entity from '../entities/Entity';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import ToolsDb from '../tools/ToolsDb';
import { EntityData } from '../types/types';
import ContractEntityAssociationsHelper from './ContractEntityAssociationsHelper';

/**
 * Repository dla asocjacji Contract-Entity
 * Tabela: Contracts_Entities
 *
 * WZORZEC: Używa ContractEntityAssociationsHelper dla metody find()
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
     * WZORZEC: Deleguje do ContractEntityAssociationsHelper (unikanie duplikacji SQL)
     */
    async find(params?: {
        contractId?: number;
        projectId?: string;
    }): Promise<ContractEntity[]> {
        const associations =
            await ContractEntityAssociationsHelper.getContractEntityAssociationsList(
                {
                    projectId: params?.projectId,
                    contractId: params?.contractId,
                }
            );

        // Konwersja ContractEntityAssociation[] → ContractEntity[]
        return associations.map(
            (assoc) =>
                new ContractEntity({
                    contractRole: assoc.contractRole,
                    _contract: assoc._contract,
                    _entity: assoc._entity,
                })
        );
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
