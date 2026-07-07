export interface ScrumboardContractStatusData {
    contractId: number;
    discussed: boolean;
    discussedAt?: string | null;
    discussedByPersonId?: number | null;
}

/** Flaga "Omówiony na planowaniu" dla kontraktu (scrumboard). */
export default class ScrumboardContractStatus
    implements ScrumboardContractStatusData
{
    contractId: number;
    discussed: boolean;
    discussedAt?: string | null;
    discussedByPersonId?: number | null;

    constructor(data: ScrumboardContractStatusData) {
        this.contractId = data.contractId;
        this.discussed = data.discussed;
        this.discussedAt = data.discussedAt ?? null;
        this.discussedByPersonId = data.discussedByPersonId ?? null;
    }
}
