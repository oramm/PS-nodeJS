export type MilestoneContractLinkData = {
    milestoneId: number;
    contractId: number;
};

export default class MilestoneContractLink implements MilestoneContractLinkData {
    milestoneId: number;
    contractId: number;

    constructor(data: MilestoneContractLinkData) {
        this.milestoneId = data.milestoneId;
        this.contractId = data.contractId;
    }
}
export type LinkMilestoneContext = {
    id: number;
    contractId: number | null;
    offerId: number | null;
};
export type LinkContractContext = { id: number; projectOurId: string };
