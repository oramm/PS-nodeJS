import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import Lifecycle from '../sharing/MilestoneLifecycleController';
import Sharing from '../sharing/MilestoneSharingRepository';
import Shortcut from '../sharing/MilestoneShortcutController';
import Access from './ConsolidationAccessValidator';
import FinalizationRepository from './ConsolidationFinalizationRepository';
import Human, { type HumanTransport } from './ConsolidationFinalizationValidator';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

const repository = new FinalizationRepository();
const sharing = new Sharing();

export default class ConsolidationShortcutController {
    static async prepare(id: unknown, contract: unknown, user?: UserData, scope?: ProjectScope, machine?: HumanTransport) {
        Human.human(user, machine);
        const operationId = Access.uuid(id);
        const contractId = Number(contract);
        if (typeof contract !== 'string' || !/^[1-9][0-9]*$/.test(contract) ||
            !Number.isSafeInteger(contractId) || contractId > 2147483647)
            throw new ConsolidationMappingError('INVALID_REQUEST');

        return Lifecycle.runWithConnection(async conn => {
            const { state } = await repository.authorize(operationId, user!, scope, conn);
            if (state.state !== 'TRANSFERRING' || !state.units.length || state.units.some(unit => !unit.moved) ||
                contractId === state.accountingContractId || !state.participantContractIds.includes(contractId))
                throw new ConsolidationMappingError('SHORTCUT_ACTION_UNAVAILABLE', 409);

            const milestoneId = state.destinationMilestoneId;
            const snapshot = await sharing.snapshot(milestoneId, conn);
            const link = snapshot.links.find(row => row.ContractId === contractId);
            if (!link || snapshot.links.some(row => row.OperationId != null) ||
                !['PENDING', 'FAILED', 'READY'].includes(link.ShortcutStatus))
                throw new ConsolidationMappingError('SHORTCUT_ACTION_UNAVAILABLE', 409);

            if (link.ShortcutStatus !== 'READY') {
                // ensure commits one Drive ID before creating it and reuses that ID after an ambiguous result.
                await Shortcut.ensure(milestoneId, contractId);
            }
            const current = (await sharing.snapshot(milestoneId, conn)).links.find(row => row.ContractId === contractId);
            if (current?.ShortcutStatus !== 'READY' || !current.ShortcutId || current.OperationId != null)
                throw new ConsolidationMappingError('SHORTCUT_PREPARATION_FAILED', 503);

            return { operationId, contractId };
        });
    }
}
