import BaseRepository from '../../repositories/BaseRepository';
import ContractRange from './ContractRange';
import mysql from 'mysql2';
import ToolsDb from '../../tools/ToolsDb';

export interface ContractRangeSearchParams {
    searchText?: string;
    id?: number;
    description?: string;
    name?: string;
}

export default class ContractRangeRepository extends BaseRepository<ContractRange> {
    constructor() {
        super('ContractRanges');
    }

    protected mapRowToEntity(row: any): ContractRange {
        return new ContractRange({
            id: row.Id,
            name: ToolsDb.sqlToString(row.Name),
            description: ToolsDb.sqlToString(row.Description),
        });
    }    

    async find(
        orConditions: ContractRangeSearchParams[] = []): Promise<ContractRange[]> {       
            const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';
        const sql = `SELECT ContractRanges.Id, 
            ContractRanges.Name, 
            ContractRanges.Description
          FROM ContractRanges
          WHERE ${conditions}
          ORDER BY ContractRanges.Name ASC`;
        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));

        
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(ContractRanges.Name LIKE ${mysql.escape(`%${word}%`)}
                OR ContractRanges.Description LIKE ${mysql.escape(`%${word}%`)})`,
            );
        return conditions.join(' AND ');
         
    }

    private makeAndConditions(searchParams: ContractRangeSearchParams) {
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

}
