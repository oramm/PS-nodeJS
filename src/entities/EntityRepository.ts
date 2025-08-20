import BaseRepository from "../repositories/BaseRepository";
import Entity from "./Entity";
import mysql from "mysql2/promise";
import ToolsDb from "../tools/ToolsDb";

export interface EntitiesSearchParams {
    projectId?: string;
    id?: number;
    name?: string;
    searchText?: string;
};

export default class EntityRepository extends BaseRepository<Entity> {
    constructor() {
        super('Entities');
    }

    protected mapRowToEntity(row: any): Entity {
        return new Entity({
            id: row.Id,
            name: row.Name,
            address: row.Address,
            taxNumber: row.TaxNumber,
            www: row.Www,
            email: row.Email,
            phone: row.Phone,
        });
    }

    async find(orConditions: EntitiesSearchParams[] = []): Promise<Entity[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        const sql = `SELECT Entities.Id, 
                            Entities.Name, 
                            Entities.Address, 
                            Entities.TaxNumber, 
                            Entities.Www, 
                            Entities.Email, 
                            Entities.Phone
                     FROM Entities
                     WHERE ${conditions}
                     ORDER BY Entities.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }

    private makeAndConditions(searchParams: EntitiesSearchParams): string {
        const conditions: string[] = [];
        
        if (searchParams.projectId) {
            conditions.push(mysql.format(`Contracts.ProjectOurId = ?`, [searchParams.projectId]));
        }
        if (searchParams.id) {
            conditions.push(mysql.format(`Entities.Id = ?`, [searchParams.id]));
        }
        if (searchParams.name) {
            conditions.push(mysql.format(`Entities.Name LIKE ?`, [`%${searchParams.name}%`]));
        }
 
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
       if (searchTextCondition) {
           conditions.push(searchTextCondition);
    }
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private makeSearchTextCondition(searchText: string | undefined) : string {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Entities.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Entities.Address LIKE ${mysql.escape(`%${word}%`)}
                OR Entities.Email LIKE ${mysql.escape(`%${word}%`)})`
        );
        return conditions.join(' AND ');
    }

    private processEntitiesResult(result: any[]): Entity[] {
    let newResult: Entity[] = [];

    for (const row of result) {
        const item = new Entity({
            id: row.Id,
            name: ToolsDb.sqlToString(row.Name),
            address: ToolsDb.sqlToString(row.Address),
            taxNumber: row.TaxNumber,
            www: row.Www,
            email: row.Email,
            phone: row.Phone,
        });
        newResult.push(item);
    }
    return newResult;
    }
}

