import BaseRepository from '../repositories/BaseRepository';
import Entity from './Entity';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import {
    GUS_ACCEPTABLE_FIELDS,
    GusAcceptableField,
    GusSnapshot,
    GusStatus,
    isGusStatus,
} from './gusBir/GusCompare';

/** Wartość z bazy sprowadzona do słownika stanów; śmieć w kolumnie znaczy „nie sprawdzano". */
function toGusStatus(value: unknown): GusStatus {
    return isGusStatus(value) ? value : 'NOT_CHECKED';
}

/**
 * MariaDB 10.6/10.11: kolumna JSON to alias LONGTEXT, więc sterownik oddaje zwykły tekst —
 * migawkę parsujemy w kodzie, nie operatorami JSON w SQL (te z MySQL 8 tu nie istnieją).
 * Uszkodzona treść nie ma prawa wywrócić listy podmiotów, dlatego kończy się jako null.
 */
function parseGusSnapshot(value: unknown): GusSnapshot | null {
    if (!value) return null;
    if (typeof value === 'object') return value as GusSnapshot;
    try {
        return JSON.parse(String(value)) as GusSnapshot;
    } catch {
        return null;
    }
}

/** Pole migawki -> kolumna w Entities. Zamknięta lista: /gus/accept nie tyka niczego spoza niej. */
const GUS_ACCEPT_COLUMNS: Record<GusAcceptableField, string> = {
    name: 'Name',
    address: 'Address',
    regon: 'Regon',
    krs: 'Krs',
};

export interface EntitiesSearchParams {
    projectId?: string;
    id?: number;
    name?: string;
    shortName?: string;
    searchText?: string;
    /**
     * GPO-3 — filtr po stanie sprawdzenia w rejestrze GUS, wielokrotny wybór.
     * Przychodzą KODY stanów (`DIFF_MINOR`), nie nazwy z ekranu: napisy widziane przez
     * człowieka są sprawą frontu i nie mają czego szukać w zapytaniu do bazy.
     */
    gusStatuses?: string[];
}

export default class EntityRepository extends BaseRepository<Entity> {
    constructor() {
        super('Entities');
    }

    protected mapRowToModel(row: any): Entity {
        const entity = new Entity({
            id: row.Id,
            name: row.Name,
            shortName: row.ShortName,
            address: row.Address,
            taxNumber: row.TaxNumber,
            regon: row.Regon,
            krs: row.Krs,
            www: row.Www,
            email: row.Email,
            phone: row.Phone,
        });
        // GUS-2: pola GUS wchodzą po konstruktorze, bo konstruktor obsługuje też dane
        // z formularza i wszystko, co przez niego przejdzie, trafia potem do zapisu.
        entity.gusStatus = toGusStatus(row.GusStatus);
        entity.gusCheckedAt = row.GusCheckedAt ?? null;
        entity.gusSnapshot = parseGusSnapshot(row.GusSnapshot);
        return entity;
    }

    async find(orConditions: EntitiesSearchParams[] = []): Promise<Entity[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        const sql = `SELECT Entities.Id,
                            Entities.Name,
                            Entities.ShortName,
                            Entities.Address,
                            Entities.TaxNumber,
                            Entities.Regon,
                            Entities.Krs,
                            Entities.Www,
                            Entities.Email,
                            Entities.Phone,
                            Entities.GusStatus,
                            Entities.GusCheckedAt,
                            Entities.GusSnapshot
                     FROM Entities
                     WHERE ${conditions}
                     ORDER BY Entities.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    /**
     * GUS-2 / D-GUS-1 — zapisuje sam wynik porównania z GUS.
     *
     * ZABEZPIECZENIE: ta instrukcja wymienia z nazwy wyłącznie trzy kolumny GusStatus,
     * GusCheckedAt i GusSnapshot. Nazwa, adres, NIP, REGON i KRS podmiotu nie mają prawa
     * się tu pojawić — sprawdzenie w GUS nigdy nie zmienia danych podmiotu, zmienia je
     * dopiero człowiek trasą /gus/accept. Pilnuje tego test
     * `EntitiesController.gusCheck.test.ts` („check nie zmienia Name ani Address").
     *
     * `snapshot === undefined` znaczy „nie ruszaj migawki" (tak wygląda awaria GUS-u:
     * fail-open, status ERROR, a to, co GUS mówił poprzednio, zostaje). `null` czyści.
     */
    async updateGusResult(
        id: number,
        data: {
            status: GusStatus;
            checkedAt: Date;
            snapshot?: GusSnapshot | null;
        }
    ): Promise<void> {
        const setClauses = ['GusStatus = ?', 'GusCheckedAt = ?'];
        const params: any[] = [data.status, data.checkedAt];

        if (data.snapshot !== undefined) {
            setClauses.push('GusSnapshot = ?');
            params.push(data.snapshot ? JSON.stringify(data.snapshot) : null);
        }
        params.push(id);

        const sql = mysql.format(
            `UPDATE Entities SET ${setClauses.join(', ')} WHERE Id = ?`,
            params
        );
        await ToolsDb.executeSQL(sql);
    }

    /**
     * GUS-2 / D-GUS-1 — przepisuje do rekordu wartości przyjęte przez człowieka z migawki.
     *
     * Do instrukcji wchodzą wyłącznie pola obecne w `values`, a nazwy kolumn biorą się
     * z zamkniętej listy GUS_ACCEPT_COLUMNS — nic spoza czwórki nazwa / adres / REGON / KRS
     * nie da się tędy zapisać. Pole, którego człowiek nie wskazał, nie trafia do instrukcji,
     * więc zostaje w bazie dokładnie takie, jakie było.
     *
     * Data sprawdzenia zostaje nietknięta: przyjęcie nie jest nowym pytaniem do GUS-u.
     *
     * GUS-4a: `conn` pozwala wykonać ten zapis w cudzej transakcji. Kontroler tego
     * używa, żeby wiersz kolejki synchronizacji z FIDmanem powstał razem z zapisem
     * albo wcale (SYNC-P1). Pominięty `conn` = zapis sam dla siebie, jak dotąd.
     */
    async applyGusValues(
        id: number,
        values: Partial<Record<GusAcceptableField, string>>,
        status: GusStatus,
        conn?: mysql.PoolConnection
    ): Promise<void> {
        const setClauses: string[] = [];
        const params: any[] = [];

        for (const field of GUS_ACCEPTABLE_FIELDS) {
            const value = values[field];
            if (value === undefined) continue;
            setClauses.push(`${GUS_ACCEPT_COLUMNS[field]} = ?`);
            params.push(value);
        }

        setClauses.push('GusStatus = ?');
        params.push(status, id);

        const sql = mysql.format(
            `UPDATE Entities SET ${setClauses.join(', ')} WHERE Id = ?`,
            params
        );
        await ToolsDb.executeSQL(sql, [], conn);
    }

    private makeAndConditions(searchParams: EntitiesSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.projectId) {
            conditions.push(
                mysql.format(`Contracts.ProjectOurId = ?`, [
                    searchParams.projectId,
                ])
            );
        }
        if (searchParams.id) {
            conditions.push(mysql.format(`Entities.Id = ?`, [searchParams.id]));
        }
        if (searchParams.name) {
            conditions.push(
                mysql.format(`Entities.Name LIKE ?`, [`%${searchParams.name}%`])
            );
        }
        if (searchParams.shortName) {
            conditions.push(
                mysql.format(`Entities.ShortName = ?`, [searchParams.shortName])
            );
        }
        // GPO-3: przez sito przechodzą wyłącznie kody ze słownika stanów — cokolwiek
        // innego przyszłoby z żądania, do zapytania nie wejdzie. Pusta lista znaczy
        // „bez filtrowania", tak samo jak brak pola.
        const gusStatuses = (searchParams.gusStatuses ?? []).filter(
            (status): status is GusStatus => isGusStatus(status)
        );
        if (gusStatuses.length > 0) {
            conditions.push(
                mysql.format(`Entities.GusStatus IN (?)`, [gusStatuses])
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition) {
            conditions.push(searchTextCondition);
        }
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Entities.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Entities.Address LIKE ${mysql.escape(`%${word}%`)}
                OR Entities.Email LIKE ${mysql.escape(`%${word}%`)}
                OR Entities.TaxNumber LIKE ${mysql.escape(`%${word}%`)})`
        );
        return conditions.join(' AND ');
    }
}
