import type { PoolConnection } from 'mysql2/promise';
import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import Repository from './ConsolidationPreviewRepository';
import Preview from './ConsolidationPreview';
import Access from './ConsolidationAccessValidator';

const repository = new Repository();

/** Internal read using the caller's transaction. Does not authorize a finalized operation or validate live revision. */
export default class ConsolidationAccessController {
    static async getSaved(id: unknown, user: UserData | undefined, scope: ProjectScope | undefined, conn: PoolConnection) {
        Access.actor(user);
        const previewId = Access.uuid(id);
        const header = await repository.header(previewId, conn);
        Access.header(header, scope);
        const ids = [header.SourceMilestoneId, header.DestinationMilestoneId];
        const participants = await repository.participants(ids, conn);
        const project = Access.participants(ids, participants, scope);
        const text = await repository.content(previewId, conn);
        const saved = Preview.restore(text);
        Access.stored(header, saved, project);
        const originalIds = saved.content.scope.participantContractIds;
        const originalProject = Access.participants(ids, {
            milestones: participants.milestones,
            contractIds: originalIds,
            contracts: await repository.contracts(originalIds, conn),
        }, scope);
        Access.stored(header, saved, originalProject);
        return { header, text, saved };
    }
}
