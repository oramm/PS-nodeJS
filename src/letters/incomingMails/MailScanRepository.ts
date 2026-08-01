import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import { MailScanData } from '../../types/types';

export type MailScanSearchParams = {
    account?: string;
    mailbox?: string;
};

/**
 * Znacznik ostatniego skanu skrzynki.
 *
 * Bez klasy modelu świadomie: rekord nie ma żadnego zachowania własnego, a jedyna reguła — znacznik
 * idzie wyłącznie do przodu i nigdy poza chwilę bieżącą — siedzi w SQL, nie w JS. To nie jest
 * skrót: dwa równoległe przebiegi z dwóch kont muszą rozstrzygnąć się w bazie, a `SELECT` +
 * porównanie w aplikacji + `UPDATE` przepuściłby cofnięcie znacznika przez wolniejszy przebieg.
 */
export default class MailScanRepository extends BaseRepository<MailScanData> {
    constructor() {
        super('MailScans');
    }

    async find(
        orConditions: MailScanSearchParams[] = []
    ): Promise<MailScanData[]> {
        const sql = `SELECT MailScans.Id,
            MailScans.Account,
            MailScans.Mailbox,
            MailScans.ScannedUntil,
            MailScans.LastRunAt,
            MailScans.EditorId
        FROM MailScans
        WHERE ${this.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY MailScans.Account ASC, MailScans.Mailbox ASC`;

        const result = await this.executeQuery(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    /**
     * Przesuwa znacznik po ZAKOŃCZONYM przebiegu.
     *
     * Dwa zabezpieczenia, oba w jednym zapytaniu, bo oba muszą przetrwać równoległe przebiegi:
     * - `LEAST(?, NOW())` — granicy nie bierzemy na wiarę. Wchodzi ona z nagłówka `Date` ostatniej
     *   przetworzonej wiadomości, czyli z wartości podanej przez nadawcę; jeden mail z datą
     *   w przyszłości przesunąłby znacznik i zjadł całą resztę skrzynki.
     * - `GREATEST(ScannedUntil, ...)` — znacznik nigdy nie cofa się. Spóźniony przebieg, który
     *   skończył okno starsze niż to już zapisane, nie odsłania z powrotem przerobionych maili.
     *
     * Czego to zapytanie NIE zrobi za wywołującego: przebieg przerwany w połowie nie ma prawa go
     * w ogóle zawołać. Kierunek błędu ma być zawsze „powtórz okno", nigdy „pomiń".
     */
    async advance(params: {
        account: string;
        mailbox: string;
        scannedUntil: string;
        editorId?: number | null;
    }): Promise<void> {
        const sql = mysql.format(
            `INSERT INTO MailScans (Account, Mailbox, ScannedUntil, EditorId)
            VALUES (?, ?, LEAST(?, NOW()), ?)
            ON DUPLICATE KEY UPDATE
                ScannedUntil = GREATEST(MailScans.ScannedUntil, VALUES(ScannedUntil)),
                EditorId = VALUES(EditorId),
                LastRunAt = CURRENT_TIMESTAMP`,
            [
                params.account,
                params.mailbox,
                params.scannedUntil,
                params.editorId ?? null,
            ]
        );

        await this.executeQuery(sql);
    }

    private makeAndConditions(searchParams: MailScanSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.account)
            conditions.push(
                mysql.format('MailScans.Account = ?', [searchParams.account])
            );

        if (searchParams.mailbox)
            conditions.push(
                mysql.format('MailScans.Mailbox = ?', [searchParams.mailbox])
            );

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    protected mapRowToModel(row: any): MailScanData {
        return {
            id: row.Id,
            account: row.Account,
            mailbox: row.Mailbox,
            scannedUntil: row.ScannedUntil,
            lastRunAt: row.LastRunAt,
            editorId: row.EditorId,
        };
    }
}
