import { OAuth2Client } from 'google-auth-library';
import BaseController from '../../controllers/BaseController';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';
import Case from '../milestones/cases/Case';
import CasesController from '../milestones/cases/CasesController';
import CaseTypesController from '../milestones/cases/caseTypes/CaseTypesController';
import MilestonesController from '../milestones/MilestonesController';
import { SecuritiesSearchParams, Security } from './Security';
import SecurityRepository from './SecurityRepository';

export default class SecuritiesController extends BaseController<
    Security,
    SecurityRepository
> {
    private static instance: SecuritiesController;

    private constructor() {
        super(new SecurityRepository());
    }

    public static getInstance(): SecuritiesController {
        if (!SecuritiesController.instance) {
            SecuritiesController.instance = new SecuritiesController();
        }
        return SecuritiesController.instance;
    }

    static async find(orConditions: SecuritiesSearchParams[]) {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    static async addFromDto(dto: any, auth?: OAuth2Client): Promise<Security> {
        const item = new Security(dto);
        return await this.add(item, auth);
    }

    static async add(item: Security, auth?: OAuth2Client): Promise<Security> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            // 1. Create Case
            const caseItem = await this.createCaseForSecurity(item, auth);
            item.caseId = caseItem.id;
            item._case = caseItem;

            // 2. Add Security to DB
            await instance.repository.addInDb(item, conn, true);

            item.setGdFolderUrl();
            return item;
        });
    }

    static async editFromDto(dto: any, auth?: OAuth2Client): Promise<Security> {
        const item = new Security(dto);
        return await this.edit(item, auth);
    }

    static async edit(item: Security, auth?: OAuth2Client): Promise<Security> {
        const instance = this.getInstance();
        await instance.repository.editInDb(item);
        return item;
    }

    static async deleteFromDto(
        dto: any,
        auth?: OAuth2Client
    ): Promise<Security> {
        const item = new Security(dto);
        await this.delete(item, auth);
        return item;
    }

    static async delete(item: Security, auth?: OAuth2Client): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(item);
        if (item._case) {
            await CasesController.delete(item._case, auth);
        }
    }

    private static async createCaseForSecurity(
        security: Security,
        auth?: OAuth2Client
    ): Promise<Case> {
        const caseType = (
            await CaseTypesController.find([
                { id: Setup.CaseTypes.SECURITY_GUARANTEE },
            ])
        )[0];

        const milestone = (
            await MilestonesController.find([
                {
                    contractId: security.contractId,
                    typeId: Setup.MilestoneTypes.OURCONTRACT_ADMINISTRATION,
                },
            ])
        )[0];

        const caseItem = new Case({
            _type: caseType,
            _parent: milestone,
        });

        const result = await CasesController.add(caseItem, auth);
        return result.caseItem;
    }
}
