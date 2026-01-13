import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import ToolsDb from '../tools/ToolsDb';
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';

export type ProjectEntitySearchParams = {
    projectId?: number;
    projectIds?: number[];
    projectOurId?: string;
    entityId?: number;
    projectRole?: 'EMPLOYER' | 'ENGINEER';
};

export default class ProjectEntityRepository extends BaseRepository<ProjectEntity> {
    constructor() {
        super('Projects_Entities');
    }

    protected mapRowToModel(row: any): ProjectEntity {
        return new ProjectEntity({
            _project: { id: row.ProjectId },
            _entity: new Entity({
                id: row.EntityId,
                name: ToolsDb.sqlToString(row.Name),
                address: ToolsDb.sqlToString(row.Address),
                taxNumber: ToolsDb.sqlToString(row.TaxNumber),
                www: ToolsDb.sqlToString(row.Www),
                email: ToolsDb.sqlToString(row.Email),
                phone: ToolsDb.sqlToString(row.Phone),
            }),
            projectRole: row.ProjectRole,
        });
    }

    async find(
        conditions: ProjectEntitySearchParams = {}
    ): Promise<ProjectEntity[]> {
        const whereConditions = this.makeAndConditions(conditions);

        const sql = `SELECT
            Projects_Entities.ProjectId,
            Projects_Entities.EntityId,
            Projects_Entities.ProjectRole,
            Entities.Name,
            Entities.Address,
            Entities.TaxNumber,
            Entities.Www,
            Entities.Email,
            Entities.Phone
        FROM Projects_Entities
        JOIN Projects ON Projects_Entities.ProjectId = Projects.Id
        JOIN Entities ON Projects_Entities.EntityId = Entities.Id
        WHERE ${whereConditions}
        ORDER BY Projects_Entities.ProjectRole, Entities.Name`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    async deleteByProjectId(
        projectId: number,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const sql = 'DELETE FROM Projects_Entities WHERE ProjectId = ?';
        await ToolsDb.executePreparedStmt(
            sql,
            [projectId],
            { projectId },
            conn,
            true
        );
    }

    /**
     * Buduje warunki WHERE (AND) dla zapytań
     */
    private makeAndConditions(conditions: ProjectEntitySearchParams): string {
        const whereClauses: string[] = [];

        if (conditions.projectId) {
            whereClauses.push(
                mysql.format('Projects_Entities.ProjectId = ?', [
                    conditions.projectId,
                ])
            );
        } else if (conditions.projectIds && conditions.projectIds.length > 0) {
            whereClauses.push(
                mysql.format('Projects_Entities.ProjectId IN (?)', [
                    conditions.projectIds,
                ])
            );
        }

        if (conditions.projectOurId) {
            whereClauses.push(
                mysql.format('Projects.OurId = ?', [conditions.projectOurId])
            );
        }

        if (conditions.entityId) {
            whereClauses.push(
                mysql.format('Projects_Entities.EntityId = ?', [
                    conditions.entityId,
                ])
            );
        }

        if (conditions.projectRole) {
            whereClauses.push(
                mysql.format('Projects_Entities.ProjectRole = ?', [
                    conditions.projectRole,
                ])
            );
        }

        return whereClauses.length > 0 ? whereClauses.join(' AND ') : '1';
    }
}
