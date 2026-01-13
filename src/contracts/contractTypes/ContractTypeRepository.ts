import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import BaseRepository from '../../repositories/BaseRepository';
import ContractType from './ContractType';

export type ContractTypesSearchParams = {
    id?: number;
    status?: string;
};

/**
 * Repository dla typów kontraktów
 * Tabela: ContractTypes
 */
export default class ContractTypeRepository extends BaseRepository<ContractType> {
    constructor() {
        super('ContractTypes');
    }

    /**
     * Wyszukuje typy kontraktów według podanych kryteriów
     * @param orConditions - tablica warunków łączonych przez OR
     */
    async find(
        orConditions: ContractTypesSearchParams[] = [{}]
    ): Promise<ContractType[]> {
        const sql = `SELECT 
                ContractTypes.Id,
                ContractTypes.Name,
                ContractTypes.Description,
                ContractTypes.IsOur,
                ContractTypes.Status
            FROM ContractTypes
            WHERE ${this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}`;

        const result = <RowDataPacket[]>(
            await ToolsDb.getQueryCallbackAsync(sql)
        );
        return result.map((row) => this.mapRowToModel(row));
    }

    /**
     * Tworzy warunki AND dla pojedynczego zestawu parametrów wyszukiwania
     */
    private makeAndConditions(searchParams: ContractTypesSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.id !== undefined) {
            conditions.push(
                mysql.format('ContractTypes.Id = ?', [searchParams.id])
            );
        }

        if (searchParams.status !== undefined) {
            conditions.push(
                mysql.format('ContractTypes.Status = ?', [searchParams.status])
            );
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Mapuje wiersz z bazy danych na obiekt ContractType
     */
    protected mapRowToModel(row: RowDataPacket): ContractType {
        return new ContractType({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            isOur: row.IsOur,
            status: row.Status,
        });
    }
}
