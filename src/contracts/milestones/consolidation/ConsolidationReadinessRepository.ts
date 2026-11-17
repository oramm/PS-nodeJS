import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import Operations from './ConsolidationOperationRepository';
import Reader from './ConsolidationEffectsRepository';
import Preparation from './ConsolidationPreparationRepository';
import Operation from './ConsolidationOperation';
import Participants from './ConsolidationPreviewRepository';
import Access from './ConsolidationAccessValidator';
import type { ReadinessCheckRecord } from './ConsolidationReadinessCheck';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

/** Caller owns consistent read transaction and authorization. No connection or transaction fallback. */
export default class ConsolidationReadinessRepository {
    async authorize(operationId: string, user: UserData, scope: ProjectScope | undefined, conn: PoolConnection) {
        Access.actor(user);
        // Roles live exclusively in active PersonAccounts; never use legacy Persons columns.
        const [accounts] = await conn.query<RowDataPacket[]>(`SELECT a.SystemRoleId FROM PersonAccounts a
            JOIN Persons p ON p.Id=a.PersonId WHERE a.PersonId=? AND a.IsActive=1`, [user.enviId]);
        if (accounts.length !== 1) throw new Error('SESSION_REQUIRED', 401);
        Access.actor({ ...user, systemRoleId: Number(accounts[0].SystemRoleId) });
        const record = await new Operations().find(operationId, conn, false);
        if (!record || (scope && !scope.projectOurIds.includes(record.projectOurId))) throw new Error('OBJECT_NOT_FOUND', 404);
        const state = Operation.restore(record);
        const ids = [state.sourceMilestoneId, state.destinationMilestoneId], participants = new Participants();
        const current = await participants.participants(ids, conn);
        const project = Access.participants(ids, current, scope);
        const historical = Access.participants(ids, { ...current, contractIds: state.participantContractIds,
            contracts: await participants.contracts(state.participantContractIds, conn) }, scope);
        if (project !== state.projectOurId || historical !== state.projectOurId) throw new Error('CROSS_PROJECT', 409);
        return { record, state, actorRole: Number(accounts[0].SystemRoleId) };
    }
    async read(operationId: string, user: UserData, scope: ProjectScope | undefined, conn: PoolConnection) {
        const { record, state, actorRole } = await this.authorize(operationId, user, scope, conn);
        const sql = await new Reader().readEffects(state.projectOurId, [state.sourceMilestoneId, state.destinationMilestoneId], [], conn);
        return { record, sql, actorRole };
    }
    async aliases(folderId: string, conn: PoolConnection) {
        return new Preparation().aliases(folderId, conn);
    }
    async add(check: ReadinessCheckRecord, conn: PoolConnection) {
        const [result] = await conn.query<ResultSetHeader>(`INSERT INTO MilestoneConsolidationChecks
            (CheckId, OperationId, ActorId, OperationRevision, Revision, SnapshotJSON, ResultJSON)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [check.checkId, check.operationId, check.actorId,
            check.operationRevision, check.revision, check.snapshotJSON, check.resultJSON]);
        if (result.affectedRows !== 1 || result.warningStatus) throw new Error('RETRYABLE_STORAGE_ERROR', 503);
    }
    async check(checkId: string, conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>('SELECT * FROM MilestoneConsolidationChecks WHERE CheckId=?', [checkId]))[0][0];
    }
}
