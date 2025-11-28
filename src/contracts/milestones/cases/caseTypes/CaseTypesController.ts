import BaseController from '../../../../controllers/BaseController';
import ToolsDb from '../../../../tools/ToolsDb';
import CaseType from './CaseType';
import CaseTypeRepository from './CaseTypeRepository';

export default class CaseTypesController extends BaseController<
    CaseType,
    CaseTypeRepository
> {
    private static instance: CaseTypesController;

    constructor() {
        super(new CaseTypeRepository());
    }

    private static getInstance(): CaseTypesController {
        if (!this.instance) {
            this.instance = new CaseTypesController();
        }
        return this.instance;
    }

    static async add(item: CaseType): Promise<CaseType> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            await instance.repository.addInDb(item, conn, true);
            return item;
        });
    }

    static async edit(item: CaseType): Promise<CaseType> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            await instance.repository.editInDb(item, conn, true);
            return item;
        });
    }

    static async delete(item: CaseType): Promise<void> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            await instance.repository.deleteFromDb(item);
        });
    }

    static async find(
        orConditions: any[] | undefined = []
    ): Promise<CaseType[]> {
        const instance = this.getInstance();
        return await instance.repository.find({ orConditions });
    }

    /**
     * @deprecated Użyj CaseTypesController.find()
     */
    static async getCaseTypesList(orConditions: any[] | undefined = []) {
        return await this.find(orConditions);
    }

    /**
     * @deprecated Logika przeniesiona do Repository
     */
    static makeAndConditions(initParamObject: any) {
        // Metoda pomocnicza, teraz prywatna w Repository
        return '';
    }

    /**
     * @deprecated Logika przeniesiona do Repository
     */
    static async processCaseTypesResult(result: any[]) {
        // Metoda pomocnicza, teraz w Repository.mapRowToModel
        return [];
    }
}
