import { MilestoneContractLinkData, LinkMilestoneContext, LinkContractContext } from './MilestoneContractLink';

export default class MilestoneContractLinkValidator {
    static validateDto(dto: MilestoneContractLinkData): void {
        if (!dto || ![dto.milestoneId, dto.contractId].every(
            (id) => Number.isInteger(id) && id > 0 && id <= 2147483647
        )) throw new Error('INVALID_REQUEST');
    }

    static validateParents(
        dto: MilestoneContractLinkData,
        milestone: LinkMilestoneContext | undefined,
        contracts: LinkContractContext[]
    ): void {
        if (!milestone) throw new Error('OBJECT_NOT_FOUND');
        if (!milestone.contractId || milestone.offerId !== null)
            throw new Error('TYPE_MISMATCH');
        if (milestone.contractId === dto.contractId) throw new Error('SELF_LINK');
        const source = contracts.find((item) => item.id === milestone.contractId);
        const target = contracts.find((item) => item.id === dto.contractId);
        if (!source || !target) throw new Error('OBJECT_NOT_FOUND');
        if (source.projectOurId !== target.projectOurId)
            throw new Error('CROSS_PROJECT');
    }
}