import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

export default class ConsolidationAccessValidator {
    static actor(user?: UserData) {
        if (!user) throw new Error('SESSION_REQUIRED', 401);
        if (![1, 2, 3].includes(user.systemRoleId)) throw new Error('ROLE_DENIED', 403);
        if (!Number.isSafeInteger(user.enviId) || user.enviId <= 0) throw new Error('SESSION_REQUIRED', 401);
    }
    static milestoneId(value: unknown): number {
        if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new Error('INVALID_REQUEST', 400);
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id > 2147483647) throw new Error('INVALID_REQUEST', 400);
        return id;
    }
    static uuid(value: unknown): string {
        if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))
            throw new Error('INVALID_REQUEST', 400);
        return value.toLowerCase();
    }
    static revision(body: any): string {
        if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.expectedRevision !== 'string' ||
            !/^[a-f0-9]{64}$/.test(body.expectedRevision)) throw new Error('INVALID_REQUEST', 400);
        return body.expectedRevision;
    }
    static participants(ids: number[], data: { milestones: any[]; contracts: any[]; contractIds: number[] }, scope?: ProjectScope) {
        if (data.milestones.length !== new Set(ids).size || data.contracts.length !== data.contractIds.length)
            throw new Error('OBJECT_NOT_FOUND', 404);
        if (scope && data.contracts.some(c => !scope.projectOurIds.includes(c.ProjectOurId))) throw new Error('SCOPE_DENIED', 403);
        const projects = new Set(data.contracts.map(c => c.ProjectOurId));
        if (projects.size !== 1 || ![...projects][0]) throw new Error('CROSS_PROJECT', 409);
        return String([...projects][0]);
    }
    static header(header: any, scope?: ProjectScope) {
        if (!header || (scope && !scope.projectOurIds.includes(header.ProjectOurId))) throw new Error('OBJECT_NOT_FOUND', 404);
    }
    static stored(header: any, saved: any, currentProject: string) {
        if (header.ProjectOurId !== currentProject || saved.previewId !== header.PreviewId || saved.revision !== header.Revision ||
            saved.content.scope.projectOurId !== header.ProjectOurId || saved.content.scope.actorId !== header.ActorId ||
            saved.content.request.sourceMilestoneId !== header.SourceMilestoneId || saved.content.request.destinationMilestoneId !== header.DestinationMilestoneId)
            throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
    }
}
