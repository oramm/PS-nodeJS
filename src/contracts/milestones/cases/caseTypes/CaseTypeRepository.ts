import BaseRepository from '../../../../repositories/BaseRepository';
import CaseType from './CaseType';
import ToolsDb from '../../../../tools/ToolsDb';
import MilestoneType from '../../milestoneTypes/MilestoneType';
import { MilestoneTypeData } from '../../../../types/types';
import mysql from 'mysql2/promise';
import ProcessesController from '../../../../processes/ProcesesController';

export default class CaseTypeRepository extends BaseRepository<CaseType> {
    constructor() {
        super('CaseTypes');
    }

    /**
     * Wyszukuje typy spraw
     */
    async find(params: any = {}): Promise<CaseType[]> {
        const orConditions = params.orConditions || [];

        const sql = `SELECT  
                CaseTypes.Id,
                CaseTypes.Name,
                CaseTypes.Description,
                CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone,
                CaseTypes.MilestoneTypeId,
                CaseTypes.FolderNumber,
                CaseTypes.LastUpdated,
                CaseTypes.EditorId
            FROM CaseTypes
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        // Pobierz procesy dla wszystkich znalezionych typów spraw
        // Optymalizacja: pobierz procesy tylko raz
        const processes = await ProcessesController.find({});

        return result.map((row) => this.mapRowToModel(row, processes));
    }

    private makeAndConditions(initParamObject: any) {
        const milestoneCondition = initParamObject.milestoneId
            ? mysql.format(
                  `(CaseTypes.MilestoneTypeId=(SELECT TypeId FROM Milestones WHERE Id=?) OR CaseTypes.MilestoneTypeId IS NULL)`,
                  [initParamObject.milestoneId]
              )
            : '1';

        const milestoneTypeCondition = initParamObject.milestoneTypeId
            ? mysql.format(`CaseTypes.MilestoneTypeId=?`, [
                  initParamObject.milestoneTypeId,
              ])
            : '1';

        return `${milestoneCondition} 
            AND ${milestoneTypeCondition}`;
    }

    /**
     * Pobiera typy spraw dla danego typu kamienia milowego
     * Metoda specjalistyczna używana przez Milestone.getCaseTypes()
     */
    async findByMilestoneType(
        milestoneTypeId: number,
        contractTypeId?: number
    ): Promise<CaseType[]> {
        const sql = `SELECT 
            CaseTypes.Id,
            CaseTypes.Name,
            CaseTypes.FolderNumber,
            CaseTypes.IsInScrumByDefault,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
            COALESCE(MilestoneTypes_ContractTypes.IsDefault, TRUE) AS MilestoneTypeIsDefault
            FROM CaseTypes
            JOIN MilestoneTypes ON MilestoneTypes.Id=CaseTypes.MilestoneTypeId AND MilestoneTypes.Id=${milestoneTypeId}
            LEFT JOIN MilestoneTypes_ContractTypes 
                ON  MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id 
                AND MilestoneTypes_ContractTypes.ContractTypeId= ${
                    contractTypeId || 0
                } 
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId=MilestoneTypes.Id
            ORDER BY MilestoneTypeId`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    protected mapRowToModel(row: any, processes: any[] = []): CaseType {
        // Logika mapowania zależy od tego, które zapytanie zostało wykonane
        // find() zwraca inne kolumny niż findByMilestoneType()

        // Jeśli mamy MilestoneTypeName, to jest to wynik z findByMilestoneType
        if (row.MilestoneTypeName) {
            return new CaseType({
                id: row.Id,
                name: row.Name,
                folderNumber: row.FolderNumber,
                isInScrumByDefault: row.IsInScrumByDefault,
                _milestoneType: new MilestoneType({
                    id: row.MilestoneTypeId,
                    name: row.MilestoneTypeName,
                    _folderNumber: row.MilestoneTypeFolderNumber,
                    _isDefault: row.MilestoneTypeIsDefault,
                } as MilestoneTypeData),
            });
        }

        // W przeciwnym razie to wynik z find()
        return new CaseType({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            isDefault: row.IsDefault,
            isUniquePerMilestone: row.IsUniquePerMilestone,
            _milestoneType: { id: row.MilestoneTypeId },
            folderNumber: row.FolderNumber,
            _processes: processes.filter(
                (item: any) => item._caseType.id == row.Id
            ),
        });
    }
}
