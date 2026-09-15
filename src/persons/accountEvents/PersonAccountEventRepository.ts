import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import PersonAccountEvent from './PersonAccountEvent';

export type PersonAccountEventsSearchParams = {
    personId: number;
    /** Ile ostatnich zdarzeń oddać; modal uprawnień pokazuje kilkanaście, nie całą historię. */
    limit?: number;
};

/**
 * Jedyny punkt kontaktu z tabelą PersonAccountEvents (ROD-3).
 * Zapis: odziedziczone addInDb(entity, conn, isPartOfTransaction) - wołane WYŁĄCZNIE w transakcji
 * kontrolera, który zmienia konto. Odczyt: ostatnie zdarzenia osoby z imieniem autora z JOIN.
 */
export default class PersonAccountEventRepository extends BaseRepository<PersonAccountEvent> {
    static readonly DEFAULT_LIMIT = 50;

    constructor() {
        super('PersonAccountEvents');
    }

    async find(
        searchParams: PersonAccountEventsSearchParams,
    ): Promise<PersonAccountEvent[]> {
        const limit = Math.max(
            1,
            Math.min(
                500,
                Number(searchParams.limit) ||
                    PersonAccountEventRepository.DEFAULT_LIMIT,
            ),
        );
        const sql = mysql.format(
            `SELECT e.Id,
                    e.PersonId,
                    e.EditorId,
                    e.EventType,
                    e.Field,
                    e.ValueBefore,
                    e.ValueAfter,
                    e.CreatedAt,
                    p.Name AS EditorName,
                    p.Surname AS EditorSurname
             FROM PersonAccountEvents e
             LEFT JOIN Persons p ON p.Id = e.EditorId
             WHERE e.PersonId = ?
             ORDER BY e.CreatedAt DESC, e.Id DESC
             LIMIT ?`,
            [searchParams.personId, limit],
        );
        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    mapRowToModel(row: any): PersonAccountEvent {
        return new PersonAccountEvent({
            id: row.Id,
            personId: row.PersonId,
            editorId: row.EditorId ?? undefined,
            eventType: row.EventType,
            field: row.Field,
            valueBefore: row.ValueBefore ?? null,
            valueAfter: row.ValueAfter ?? null,
            _createdAt:
                row.CreatedAt instanceof Date
                    ? row.CreatedAt.toISOString()
                    : row.CreatedAt ?? undefined,
            _editorName: row.EditorName ?? null,
            _editorSurname: row.EditorSurname ?? null,
        });
    }
}
