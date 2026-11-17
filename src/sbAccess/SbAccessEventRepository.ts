import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { SbAccessEventInput, SbAccessEventRecord } from './sbAccessTypes';

/** Historia tylko do dopisywania i odczytu; bez dziedziczenia metod edycji/usuwania. */
export default class SbAccessEventRepository {
    async append(
        conn: mysql.PoolConnection,
        input: SbAccessEventInput,
    ): Promise<void> {
        if (!conn)
            throw new Error('Zapis zdarzenia SB wymaga połączenia transakcji');
        await ToolsDb.executeSQL(
            `INSERT INTO SbAccessEvents
                (PersonId, ActionCode, RequestedByPersonId, ResultCode, Note)
             VALUES (?, ?, ?, ?, ?)`,
            [
                input.personId,
                input.actionCode,
                input.requestedByPersonId ?? null,
                input.resultCode,
                input.note ?? null,
            ],
            conn,
        );
    }

    async listByPersonId(
        personId: number,
        limit: number = 50,
    ): Promise<SbAccessEventRecord[]> {
        const safeLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(500, Math.trunc(limit)))
            : 50;
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT e.Id AS id, e.PersonId AS personId, e.ActionCode AS actionCode,
                e.RequestedByPersonId AS requestedByPersonId, e.ResultCode AS resultCode,
                e.Note AS note, e.CreatedAt AS createdAt,
                p.Name AS requestedByName, p.Surname AS requestedBySurname, a.Name AS actionName
             FROM SbAccessEvents e
             LEFT JOIN Persons p ON p.Id = e.RequestedByPersonId
             JOIN SbAccessActions a ON a.Code = e.ActionCode
             WHERE e.PersonId = ?
             ORDER BY e.CreatedAt DESC, e.Id DESC LIMIT ?`,
            undefined,
            [personId, safeLimit],
        )) as SbAccessEventRecord[];
    }
}
