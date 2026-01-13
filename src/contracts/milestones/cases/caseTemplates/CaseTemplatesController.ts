import BaseController from '../../../../controllers/BaseController';
import ToolsDb from '../../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import MilestoneType from '../../milestoneTypes/MilestoneType';
import CaseType from '../caseTypes/CaseType';
import CaseTemplate from './CaseTemplate';
import CaseTemplateRepository from './CaseTemplateRepository';
import PersonsController from '../../../../persons/PersonsController';
import { UserData } from '../../../../types/sessionTypes';

export type CaseTemplatesSearchParams = {
    isDefaultOnly?: boolean;
    isInScrumByDefaultOnly?: boolean;
    contractTypeId?: number;
    milestoneTypeId?: number;
};

/**
 * Controller dla CaseTemplate - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model, transakcje)
 * - Zarządza transakcjami bazodanowymi
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 */
export default class CaseTemplatesController extends BaseController<
    CaseTemplate,
    CaseTemplateRepository
> {
    private static instance: CaseTemplatesController;

    constructor() {
        super(new CaseTemplateRepository());
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): CaseTemplatesController {
        if (!this.instance) {
            this.instance = new CaseTemplatesController();
        }
        return this.instance;
    }

    // ==================== READ ====================

    /**
     * Wyszukuje szablony spraw
     * API PUBLICZNE - zgodne z Clean Architecture
     *
     * @deprecated Użyj find() zamiast getCaseTemplatesList()
     */
    static async getCaseTemplatesList(
        searchParams: CaseTemplatesSearchParams,
        milestoneParentType: 'CONTRACT' | 'OFFER' = 'CONTRACT'
    ) {
        return this.find(searchParams, milestoneParentType);
    }

    /**
     * Wyszukuje szablony spraw
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @param milestoneParentType - Typ rodzica kamienia milowego (CONTRACT | OFFER)
     * @returns Promise<CaseTemplate[]>
     */
    static async find(
        searchParams: CaseTemplatesSearchParams = {},
        milestoneParentType: 'CONTRACT' | 'OFFER' = 'CONTRACT'
    ): Promise<CaseTemplate[]> {
        const isDefaultCondition = searchParams.isDefaultOnly
            ? 'CaseTypes.IsDefault = TRUE'
            : '1';

        const isInScrumDefaultCondition = searchParams.isInScrumByDefaultOnly
            ? 'CaseTypes.IsInScrumByDefault = TRUE'
            : '1';

        const contractTypeIdCondition =
            searchParams.contractTypeId && milestoneParentType === 'CONTRACT'
                ? mysql.format(
                      'MilestoneTypes_ContractTypes.ContractTypeId = ?',
                      [searchParams.contractTypeId]
                  )
                : '1';

        const milestoneTypeIdCondition = searchParams.milestoneTypeId
            ? mysql.format('MilestoneTypes.Id = ?', [
                  searchParams.milestoneTypeId,
              ])
            : '1=1';

        const typeIdCondition =
            milestoneParentType === 'CONTRACT'
                ? 'MilestoneTypes_ContractTypes.MilestoneTypeId IS NOT NULL'
                : 'MilestoneTypes_Offers.MilestoneTypeId IS NOT NULL';

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
                MilestoneTypes.IsUniquePerContract AS MilestoneTypeIsUniquePerContract,
                COALESCE(MilestoneTypes_ContractTypes.IsDefault, TRUE) AS MilestoneTypeIsDefault
            FROM CaseTemplates
            JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
            JOIN MilestoneTypes ON CaseTypes.MilestoneTypeId=MilestoneTypes.Id
            LEFT JOIN MilestoneTypes_ContractTypes ON MilestoneTypes.Id=MilestoneTypes_ContractTypes.MilestoneTypeId
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes.Id= MilestoneTypes_Offers.MilestoneTypeId
            WHERE   ${isDefaultCondition} 
                AND ${isInScrumDefaultCondition} 
                AND ${contractTypeIdCondition} 
                AND ${milestoneTypeIdCondition}
                AND ${typeIdCondition}
            GROUP BY CaseTemplates.Id`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCaseTemplatesResult(result);
    }

    static processCaseTemplatesResult(result: any[]): CaseTemplate[] {
        let newResult: CaseTemplate[] = [];

        for (const row of result) {
            const item = new CaseTemplate({
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
                        isUniquePerContract:
                            row.MilestoneTypeIsUniquePerContract,
                    }),
                }),
                caseTypeId: row.CaseTypeId,
            });
            newResult.push(item);
        }
        return newResult;
    }

    // ==================== ADD ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowy CaseTemplate do bazy danych
     *
     * @param item - CaseTemplate do dodania
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<CaseTemplate> - Dodany obiekt
     */
    static async add(
        item: CaseTemplate,
        userData?: UserData
    ): Promise<CaseTemplate> {
        const instance = this.getInstance();
        return await instance.addItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje CaseTemplate do bazy danych
     */
    private async addItem(
        item: CaseTemplate,
        userData?: UserData
    ): Promise<CaseTemplate> {
        console.group('CaseTemplatesController.addItem()');
        try {
            // Ustaw _editor jeśli userData jest przekazany
            if (userData && !item._editor) {
                item._editor =
                    await PersonsController.getPersonFromSessionUserData(
                        userData
                    );
                item.editorId = item._editor.id;
            }

            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.addInDb(item, conn, true);
            });
            console.log('added in db');
            return item;
        } catch (err) {
            console.error('Error adding CaseTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== EDIT ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Aktualizuje istniejący CaseTemplate
     *
     * @param item - CaseTemplate do aktualizacji
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<CaseTemplate> - Zaktualizowany obiekt
     */
    static async edit(
        item: CaseTemplate,
        userData?: UserData
    ): Promise<CaseTemplate> {
        const instance = this.getInstance();
        return await instance.editItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Aktualizuje CaseTemplate w bazie danych
     */
    private async editItem(
        item: CaseTemplate,
        userData?: UserData
    ): Promise<CaseTemplate> {
        console.group('CaseTemplatesController.editItem()');
        try {
            // Ustaw _editor jeśli userData jest przekazany
            if (userData && !item._editor) {
                item._editor =
                    await PersonsController.getPersonFromSessionUserData(
                        userData
                    );
                item.editorId = item._editor.id;
            }

            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.editInDb(item, conn, true);
            });
            console.log('edited in db');
            return item;
        } catch (err) {
            console.error('Error editing CaseTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa CaseTemplate z bazy danych
     *
     * @param item - CaseTemplate do usunięcia
     * @returns Promise<void>
     */
    static async delete(item: CaseTemplate): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteItem(item);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa CaseTemplate z bazy danych
     */
    private async deleteItem(item: CaseTemplate): Promise<void> {
        console.group('CaseTemplatesController.deleteItem()');
        try {
            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.deleteFromDb(item, conn, true);
            });
            console.log('deleted from db');
        } catch (err) {
            console.error('Error deleting CaseTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}
