import BaseRepository from '../../../../repositories/BaseRepository';
import CaseTemplate from './CaseTemplate';
import ToolsDb from '../../../../tools/ToolsDb';
import CaseType from '../caseTypes/CaseType';
import MilestoneType from '../../milestoneTypes/MilestoneType';
import { MilestoneTypeData } from '../../../../types/types';

export default class CaseTemplateRepository extends BaseRepository<CaseTemplate> {
    constructor() {
        super('CaseTemplates');
    }

    /**
     * Pobiera szablony spraw dla danego typu kamienia milowego
     */
    async findByMilestoneType(
        milestoneTypeId: number,
        params: { isDefaultOnly?: boolean; isInScrumByDefaultOnly?: boolean }
    ): Promise<CaseTemplate[]> {
        const isDefaultCondition = params.isDefaultOnly
            ? 'CaseTypes.IsDefault=TRUE'
            : '1';
        const isInScrumDefaultCondition = params.isInScrumByDefaultOnly
            ? 'CaseTypes.IsInScrumByDefault=TRUE'
            : '1';

        const sql = `SELECT CaseTemplates.Id,
            CaseTemplates.Name,
            CaseTemplates.Description,
            CaseTypes.Id AS CaseTypeId,
            CaseTypes.Name AS CaseTypeName,
            CaseTypes.FolderNumber AS CaseTypeFolderNumber,
            CaseTypes.IsInScrumByDefault  AS CaseTypeIsInScrumByDefault,
            CaseTypes.IsUniquePerMilestone  AS CaseTypeIsUniquePerMilestone,
            CaseTypes.IsDefault AS CaseTypeIsDefault,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            NULL AS MilestoneTypeIsDefault -- parametr niedostępny
            FROM CaseTemplates
            JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
            JOIN MilestoneTypes ON CaseTypes.MilestoneTypeId=MilestoneTypes.Id
            WHERE ${isDefaultCondition} 
            AND ${isInScrumDefaultCondition} 
            AND MilestoneTypes.Id=${milestoneTypeId}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    /**
     * Wyszukuje szablony spraw
     * Implementacja wymagana przez BaseRepository
     */
    async find(params: any = {}): Promise<CaseTemplate[]> {
        // TODO: Zaimplementować pełne wyszukiwanie jeśli będzie potrzebne
        // Na razie zwracamy pustą tablicę, aby spełnić kontrakt BaseRepository
        return [];
    }

    protected mapRowToModel(row: any): CaseTemplate {
        return new CaseTemplate({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            templateComment: '',
            _caseType: new CaseType({
                id: row.CaseTypeId,
                name: row.CaseTypeName,
                folderNumber: row.CaseTypeFolderNumber,
                isDefault: row.CaseTypeIsDefault,
                isInScrumByDefault: row.CaseTypeIsInScrumByDefault,
                isUniquePerMilestone: row.CaseTypeIsUniquePerMilestone,
                _milestoneType: new MilestoneType({
                    id: row.MilestoneTypeId,
                    name: row.MilestoneTypeName,
                    _isDefault: row.MilestoneTypeIsDefault,
                } as MilestoneTypeData),
            }),
            caseTypeId: row.CaseTypeId,
        });
    }
}
