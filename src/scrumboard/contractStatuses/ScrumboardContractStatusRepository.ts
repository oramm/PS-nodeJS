import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import ScrumboardContractStatus from './ScrumboardContractStatus';

export interface ScrumboardContractStatusSearchParams {
    contractId?: number;
}

/**
 * Repozytorium flag "Omówiony na planowaniu".
 * ContractId jest kluczem głównym → UPSERT przez INSERT ... ON DUPLICATE KEY UPDATE.
 */
export default class ScrumboardContractStatusRepository extends BaseRepository<ScrumboardContractStatus> {
    constructor() {
        super('ScrumboardContractStatuses');
    }

    protected mapRowToModel(row: any): ScrumboardContractStatus {
        return new ScrumboardContractStatus({
            contractId: row.ContractId,
            discussed: Boolean(row.Discussed),
            discussedAt: row.DiscussedAt ?? null,
            discussedByPersonId: row.DiscussedByPersonId ?? null,
        });
    }

    async find(
        searchParams: ScrumboardContractStatusSearchParams = {}
    ): Promise<ScrumboardContractStatus[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        if (searchParams.contractId) {
            conditions.push('ContractId = ?');
            params.push(searchParams.contractId);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT ContractId, Discussed, DiscussedAt, DiscussedByPersonId
            FROM ScrumboardContractStatuses ${where}`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql, undefined, params);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }

    /** Ustawia flagę omówienia dla kontraktu (UPSERT). */
    async setDiscussed(
        contractId: number,
        discussed: boolean,
        personId?: number | null
    ): Promise<ScrumboardContractStatus> {
        const sql = `INSERT INTO ScrumboardContractStatuses
                (ContractId, Discussed, DiscussedAt, DiscussedByPersonId)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                Discussed = VALUES(Discussed),
                DiscussedAt = VALUES(DiscussedAt),
                DiscussedByPersonId = VALUES(DiscussedByPersonId)`;
        const discussedAt = discussed ? new Date() : null;
        await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            contractId,
            discussed,
            discussedAt,
            discussed ? personId ?? null : null,
        ]);
        return new ScrumboardContractStatus({
            contractId,
            discussed,
            discussedAt: discussedAt ? discussedAt.toISOString() : null,
            discussedByPersonId: discussed ? personId ?? null : null,
        });
    }

    /** Zeruje flagi omówienia dla wszystkich kontraktów. */
    async resetAll(): Promise<void> {
        await ToolsDb.getQueryCallbackAsync(
            `UPDATE ScrumboardContractStatuses
                SET Discussed = 0, DiscussedAt = NULL, DiscussedByPersonId = NULL`
        );
    }
}
