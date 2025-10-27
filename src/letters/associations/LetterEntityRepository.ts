import BaseRepository from '../../repositories/BaseRepository';
import LetterEntity from './LetterEntity';
import Entity from '../../entities/Entity';
import ToolsDb from '../../tools/ToolsDb';
import { LetterData } from '../../types/types';

export type LetterEntitySearchParams = {
    projectId?: string;
    contractId?: number;
    milestoneId?: number;
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
        const projectId = searchParams.projectId;
        const contractId = searchParams.contractId;
        const milestoneId = searchParams.milestoneId;

        const projectCondition = projectId
            ? `Projects.OurId="${projectId}"`
            : '1';

        const contractCondition = contractId
            ? `Contracts.Id="${contractId}"`
            : '1';

        const milestoneCondition = milestoneId
            ? `Milestones.Id="${milestoneId}"`
            : '1';

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
            LEFT JOIN Contracts ON Projects.OurId = Contracts.ProjectOurId
            LEFT JOIN Milestones ON Milestones.ContractId = Contracts.Id
            LEFT JOIN Offers ON Offers.Id = Letters.OfferId
            JOIN Entities ON Letters_Entities.EntityId=Entities.Id
            WHERE ${projectCondition} 
              AND ${contractCondition} 
              AND ${milestoneCondition}
            GROUP BY LetterId, EntityId
            ORDER BY Letters_Entities.LetterRole, EntityName`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return result.map((row) => this.mapRowToModel(row));
    }
}
