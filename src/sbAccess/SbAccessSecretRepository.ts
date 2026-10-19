import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { SbSecretRecord } from './sbAccessTypes';

/**
 * Szyfrogramy haseł osób (tabela SbAccessSecrets).
 *
 * BEZ executeSQL: ten wypisuje parametry do logu, a parametrem jest szyfrogram. Błąd bazy
 * jest zamieniany na komunikat bez treści zapytania, bo błąd mysql2 niesie pole `sql`
 * z wstawionymi wartościami, a globalny handler wypisuje cały obiekt błędu.
 */
async function quiet<T>(work: () => Promise<T>): Promise<T> {
    try {
        return await work();
    } catch (error: any) {
        throw new Error(`Zapis/odczyt haseł SB nie powiódł się (${error?.code ?? 'błąd bazy'}).`);
    }
}

export default class SbAccessSecretRepository {
    /** `conn` = odczyt wewnątrz transakcji (po blokadzie wiersza osoby). */
    async listByPersonId(personId: number, conn?: mysql.PoolConnection): Promise<SbSecretRecord[]> {
        return quiet(
            async () =>
                (await ToolsDb.getQueryCallbackAsync(
                    `SELECT Name AS name, Ciphertext AS ciphertext,
                        SharedByPersonId AS sharedByPersonId,
                        CreatedAt AS createdAt, UpdatedAt AS updatedAt
                     FROM SbAccessSecrets WHERE PersonId = ? ORDER BY Name`,
                    conn,
                    [personId],
                )) as SbSecretRecord[],
        );
    }

    /** Same nazwy (bez szyfrogramów) dla całego rejestru - do stanu "X z Y" na liście. */
    async listNames(): Promise<{ personId: number; name: string }[]> {
        return (await ToolsDb.getQueryCallbackAsync(
            'SELECT PersonId AS personId, Name AS name FROM SbAccessSecrets',
        )) as { personId: number; name: string }[];
    }

    /** Udostępnienie albo podmiana hasła o tej nazwie. */
    async upsert(
        conn: mysql.PoolConnection,
        personId: number,
        name: string,
        ciphertext: string,
        sharedByPersonId: number,
    ): Promise<void> {
        if (!conn) throw new Error('Zapis hasła SB wymaga połączenia transakcji');
        await quiet(() =>
            ToolsDb.getQueryCallbackAsync(
                `INSERT INTO SbAccessSecrets (PersonId, Name, Ciphertext, SharedByPersonId)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE Ciphertext = VALUES(Ciphertext),
                    SharedByPersonId = VALUES(SharedByPersonId)`,
                conn,
                [personId, name, ciphertext, sharedByPersonId],
            ),
        );
    }

    /** Usuwa wskazane nazwy (albo wszystkie, gdy `names` nie podano); zwraca usunięte nazwy. */
    async remove(
        conn: mysql.PoolConnection,
        personId: number,
        names?: string[],
    ): Promise<string[]> {
        if (!conn) throw new Error('Usunięcie hasła SB wymaga połączenia transakcji');
        if (names && !names.length) return [];
        const filter = names ? ` AND Name IN (${names.map(() => '?').join(', ')})` : '';
        const params = [personId, ...(names ?? [])];
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Name AS name FROM SbAccessSecrets WHERE PersonId = ?${filter} FOR UPDATE`,
            conn,
            params,
        )) as { name: string }[];
        if (!rows.length) return [];
        await ToolsDb.getQueryCallbackAsync(
            `DELETE FROM SbAccessSecrets WHERE PersonId = ?${filter}`,
            conn,
            params,
        );
        return rows.map((row) => row.name);
    }
}
