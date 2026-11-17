import BaseRepository from '../../repositories/BaseRepository';
import LetterEntity from './LetterEntity';
import Entity from '../../entities/Entity';
import ToolsDb from '../../tools/ToolsDb';
import { LetterData } from '../../types/types';
import mysql from 'mysql2/promise';
import { ProjectScope } from '../../types/sessionTypes';
import { makeProjectScopeCondition } from '../../tools/ProjectScope';
import { milestoneVisibilitySql } from '../../contracts/milestones/sharing/milestoneVisibilitySql';

export type LetterEntitySearchParams = {
    projectId?: string;
    contractId?: number;
    milestoneId?: number;
    letterIds?: number[];
    scope?: ProjectScope;
};

export default class LetterEntityRepository extends BaseRepository<LetterEntity> {
    constructor() {
        super('Letters_Entities');
    }

    /**
     * Mapuje wiersz z bazy danych na instancję LetterEntity
     */
    protected mapRowToModel(row: any): LetterEntity {
        return new LetterEntity({
            letterRole: row.LetterRole,
            _letter: <LetterData>{
                id: row.LetterId,
            },
            _entity: new Entity({
                id: row.EntityId,
                name: ToolsDb.sqlToString(row.EntityName),
                address: ToolsDb.sqlToString(row.EntityAddress),
                taxNumber: row.EntityTaxNumber,
                www: row.EntityWww,
                email: row.EntityEmail,
                phone: row.EntityPhone,
            }),
        });
    }

    /**
     * Wyszukuje asocjacje Letter-Entity według parametrów
     */
    async find(
        searchParams: LetterEntitySearchParams = {}
    ): Promise<LetterEntity[]> {
        const conditions = this.makeAndConditions(searchParams);

        const sql = `SELECT  Letters_Entities.LetterId,
                Letters_Entities.EntityId,
                Letters_Entities.LetterRole,
                Entities.Name AS EntityName,
                Entities.Address AS EntityAddress,
                Entities.TaxNumber AS EntityTaxNumber,
                Entities.Www AS EntityWww,
                Entities.Email AS EntityEmail,
                Entities.Phone AS EntityPhone
            FROM Letters_Entities
            JOIN Letters ON Letters_Entities.LetterId = Letters.Id
            LEFT JOIN Projects ON Letters.ProjectId = Projects.Id
            JOIN Entities ON Letters_Entities.EntityId=Entities.Id
            WHERE ${conditions}
            ORDER BY Letters_Entities.LetterRole, EntityName`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return result.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: LetterEntitySearchParams): string {
        const clauses: string[] = [
            makeProjectScopeCondition('Projects.OurId', searchParams.scope),
        ];
        if (searchParams.projectId)
            clauses.push(mysql.format('Projects.OurId = ?', [searchParams.projectId]));
        if (searchParams.letterIds !== undefined)
            clauses.push(
                searchParams.letterIds.length
                    ? mysql.format('Letters.Id IN (?)', [searchParams.letterIds])
                    : '0'
            );
        if (searchParams.contractId || searchParams.milestoneId) {
            const caseClauses = [
                milestoneVisibilitySql({ contractId: searchParams.contractId }),
            ];
            if (searchParams.milestoneId)
                caseClauses.push(mysql.format('Milestones.Id = ?', [searchParams.milestoneId]));
            clauses.push(`EXISTS (SELECT 1 FROM Letters_Cases
                JOIN Cases ON Cases.Id = Letters_Cases.CaseId
                JOIN Milestones ON Milestones.Id = Cases.MilestoneId
                WHERE Letters_Cases.LetterId = Letters.Id AND ${caseClauses.join(' AND ')})`);
        }
        return clauses.join(' AND ');
    }
}
