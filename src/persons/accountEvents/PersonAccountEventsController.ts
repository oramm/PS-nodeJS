import mysql from 'mysql2/promise';
import { PersonAccountEventType } from '../../types/types';
import PersonAccountEvent from './PersonAccountEvent';
import PersonAccountEventRepository from './PersonAccountEventRepository';

/** Jedna zmieniona wartość: nazwa pola oraz stan przed i po (dowolny typ; serializowany do JSON). */
export type AccountFieldChange = {
    field: string;
    before: unknown;
    after: unknown;
};

export type RecordAccountChangesInput = {
    personId: number;
    /** Autor zmiany - osoba z sesji (req.session.userData.enviId); null, gdy brak (np. skrypt). */
    editorId: number | null | undefined;
    eventType: PersonAccountEventType;
    changes: AccountFieldChange[];
};

/**
 * ROD-3: zdarzenia konta osoby - kto, kiedy, co zmienił.
 *
 * ZAPIS wyłącznie przez `recordChanges` W TRANSAKCJI WOŁAJĄCEGO (kontroler, który zmienia konto,
 * przekazuje swoje `conn`). Decyzja techniczna planu ROD: zdarzenie pisze kontroler w tej samej
 * transakcji co zmiana - nie trigger w bazie, nie front. Dzięki temu zmiana bez zdarzenia i
 * zdarzenie bez zmiany są niemożliwe (obie wycofują się razem).
 *
 * Wartości identyczne po serializacji są POMIJANE: „zapisz bez zmian" z formularza nie zaśmieca
 * historii. Sekretów (tokenów) tu nie ma - wołający podaje tylko pola z zamkniętej listy.
 */
export default class PersonAccountEventsController {
    private static repository = new PersonAccountEventRepository();

    static async find(
        personId: number,
        limit?: number,
    ): Promise<PersonAccountEvent[]> {
        return await this.repository.find({ personId, limit });
    }

    /** Zwraca liczbę faktycznie zapisanych zdarzeń (po pominięciu wartości bez zmiany). */
    static async recordChanges(
        conn: mysql.PoolConnection,
        input: RecordAccountChangesInput,
    ): Promise<number> {
        let written = 0;
        for (const change of input.changes) {
            const before = serializeValue(change.before);
            const after = serializeValue(change.after);
            if (before === after) continue;

            const event = new PersonAccountEvent({
                personId: input.personId,
                editorId: input.editorId ?? undefined,
                eventType: input.eventType,
                field: change.field,
                valueBefore: before,
                valueAfter: after,
            });
            await this.repository.addInDb(event, conn, true);
            written++;
        }
        return written;
    }
}

/**
 * `undefined` i `null` = brak wartości (null w bazie); reszta jako JSON, żeby liczba, tekst,
 * boolean i lista projektów miały jeden, odwracalny zapis. Tablice sortujemy, żeby zmiana
 * kolejności bez zmiany zawartości nie liczyła się jako zmiana.
 */
export function serializeValue(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) {
        return JSON.stringify([...value].map(String).sort());
    }
    return JSON.stringify(value);
}
