import BaseController from '../../../controllers/BaseController';
import ToolsDb from '../../../tools/ToolsDb';
import MilestoneContractLink, { MilestoneContractLinkData } from './MilestoneContractLink';
import MilestoneContractLinkRepository from './MilestoneContractLinkRepository';
import MilestoneContractLinkValidator from './MilestoneContractLinkValidator';

/**
 * Internal persistence only. No router calls this until PS-MC-2 adds authorization,
 * type eligibility, revision/replay policy and guards to ALL legacy lifecycle writers.
 * This is not the public sharing API and does not guarantee Drive readiness.
 */
export default class MilestoneContractLinksController extends BaseController<MilestoneContractLink, MilestoneContractLinkRepository> {
    private static instance: MilestoneContractLinksController;

    private constructor() {
        super(new MilestoneContractLinkRepository());
    }

    private static getInstance(): MilestoneContractLinksController {
        if (!this.instance) this.instance = new MilestoneContractLinksController();
        return this.instance;
    }

    static async addFromDto(dto: MilestoneContractLinkData): Promise<MilestoneContractLink> {
        MilestoneContractLinkValidator.validateDto(dto);
        const repository = this.getInstance().repository;
        return ToolsDb.transaction<MilestoneContractLink>(async (conn) => {
            const milestone = await repository.lockMilestone(dto.milestoneId, conn);
            const ids = [dto.contractId];
            if (milestone?.contractId) ids.push(milestone.contractId);
            const contracts = await repository.lockContracts(ids, conn);
            MilestoneContractLinkValidator.validateParents(dto, milestone, contracts);
            const link = new MilestoneContractLink(dto);
            await repository.addInDb(link, conn, true);
            return link;
        });
    }
}