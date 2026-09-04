import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import BaseRepository from '../../repositories/BaseRepository';
import Entity from '../../entities/Entity';
import StaffMember from './StaffMember';
import { FidmanUserSyncStatus } from '../../types/types';
import { fidmanSkipReasonLabel } from '../../contracts/fidmanSync/FidmanSync';

/**
 * Zakres listy okna „Personel i uprawnienia" - trzy zakresy (D-PER-7, 2026-09-04).
 *
 * `permissions` (domyślny) = osoby z wierszem uprawnień. To dawny widok panelu; owner
 * wrócił do niego po tym, jak zakres `users` pokazał mu domyślnie 180 osób zamiast
 * kilkunastu z nadanymi flagami.
 * `users` = użytkownicy systemu: e-mail systemowy ALBO wiersz uprawnień. Suma, nie iloczyn,
 * bo obie połówki występują osobno: osoba z e-mailem logowania nie musi mieć wiersza flag
 * (seed migracji objął tylko role 1/2/3), a wiersz flag można nadać osobie, która e-maila
 * jeszcze nie dostała.
 * `all` = cała książka adresowa, także osoby bez konta.
 *
 * Nieznana wartość (brak, pusty string, `false` z odznaczonego przełącznika, literówka)
 * znaczy `permissions`: zawężenie zamyka się do najwęższego zakresu, nigdy nie otwiera
 * listy na wszystkich przez przypadek.
 */
export type StaffMembersScope = 'permissions' | 'users' | 'all';

export function resolveStaffMembersScope(value: unknown): StaffMembersScope {
    if (value === 'all' || value === 'users') return value;
    return 'permissions';
}

export type StaffMembersSearchParams = {
    personId?: number;
    searchText?: string;
    /** Rola systemowa osoby. Brak wartości = bez zawężania. */
    systemRoleId?: number | string;
    /** Podmioty z filtra (kształt z frontowego EntitySelector - obiekty z `id`). */
    _entities?: Entity[];
    /**
     * Zakres listy - patrz `resolveStaffMembersScope`. Wyłącznie literalne 'all' i 'users'
     * rozszerzają listę; wszystko inne znaczy „z uprawnieniami". Domyślne zawężenie jest
     * celowe: po wyczyszczeniu filtrów ekran ma pokazywać osoby z nadanymi flagami, a nie
     * pełną książkę adresową.
     */
    scope?: StaffMembersScope | string | boolean;
};

/**
 * Repository panelu uprawnień personelu.
 * Tabela: StaffMembers (odczyt prowadzony OD Persons).
 */
export default class StaffMemberAdminRepository extends BaseRepository<StaffMember> {
    constructor() {
        super('StaffMembers');
    }

    /**
     * Odczyt idzie OD Persons przez LEFT JOIN - bez tego nie dałoby się nadać
     * flagi osobie, która nie ma jeszcze wiersza (seed migracji objął tylko role 1/2/3).
     * Rola i e-mail systemowy przez COALESCE (ten sam, którym czyta fasada osób),
     * bo potrafią być zapisane tylko na koncie V2 albo tylko w zaszłej kolumnie Persons.
     */
    async find(
        orConditions: StaffMembersSearchParams[] = [{}]
    ): Promise<StaffMember[]> {
        const sql = `SELECT
                Persons.Id AS PersonId,
                Persons.Name,
                Persons.Surname,
                Persons.Email,
                Persons.EntityId,
                Entities.Name AS EntityName,
                COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) AS SystemRoleId,
                COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) AS SystemEmail,
                COALESCE(PersonAccounts.FidmanEnabled, 0) AS FidmanEnabled,
                StaffMembers.Id AS StaffMemberId,
                COALESCE(StaffMembers.IsDriver, 0) AS IsDriver,
                COALESCE(StaffMembers.IsInScrum, 0) AS IsInScrum,
                COALESCE(StaffMembers.HasCostInvoiceAccess, 0) AS HasCostInvoiceAccess,
                COALESCE(StaffMembers.HasBankAccess, 0) AS HasBankAccess,
                COALESCE(StaffMembers.CanLogSiteVisits, 0) AS CanLogSiteVisits,
                COALESCE(StaffMembers.IsActive, 1) AS IsActive,
                FidmanUserSync.Status AS FidmanSyncStatus,
                FidmanUserSync.SkipReason AS FidmanSkipReason,
                FidmanUserSync.LastError AS FidmanLastError,
                FidmanUserSync.Attempts AS FidmanAttempts,
                FidmanUserSync.UpdatedAt AS FidmanUpdatedAt,
                FidmanUserSync.Payload AS FidmanPayload
            FROM Persons
            LEFT JOIN StaffMembers ON StaffMembers.PersonId = Persons.Id
            LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id
            LEFT JOIN Entities ON Entities.Id = Persons.EntityId
            /* Ostatnia wysyłka konta do FIDmana (D-PER-8): jeden wiersz kolejki na osobę,
               ten o najwyższym Id. Sam checkbox mówi, czego chcieliśmy; kolejka mówi, co
               się stało - i tylko to widać na plakietce. RefId wiersza user.upsert = Persons.Id. */
            LEFT JOIN (
                SELECT Outbox.RefId, Outbox.Status, Outbox.SkipReason, Outbox.LastError,
                       Outbox.Attempts, Outbox.UpdatedAt, Outbox.Payload
                FROM FidmanSyncOutbox Outbox
                JOIN (
                    SELECT RefId, MAX(Id) AS LastId
                    FROM FidmanSyncOutbox
                    WHERE Kind = 'user.upsert'
                    GROUP BY RefId
                ) LastPush ON LastPush.LastId = Outbox.Id
            ) FidmanUserSync ON FidmanUserSync.RefId = Persons.Id
            WHERE ${this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Persons.Surname, Persons.Name`;

        const result = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: StaffMembersSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.personId !== undefined)
            conditions.push(
                mysql.format('Persons.Id = ?', [searchParams.personId])
            );

        // Zakres (D-PER-7). Warunek „użytkownik" powtarza COALESCE z SELECT, bo w WHERE nie da
        // się odwołać do aliasu kolumny wyliczanej. Pusty string liczy się jak brak e-maila:
        // zaszła kolumna Persons.SystemEmail bywa wypełniona pustym łańcuchem.
        const scope = resolveStaffMembersScope(searchParams.scope);
        if (scope === 'permissions')
            conditions.push('StaffMembers.Id IS NOT NULL');
        else if (scope === 'users')
            conditions.push(
                `((COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) IS NOT NULL
                    AND COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) <> '')
                  OR StaffMembers.Id IS NOT NULL)`,
            );

        // Podmiot z filtra. LEFT JOIN Entities wyżej, a nie JOIN: osoba bez podmiotu ma
        // zniknąć z listy tylko wtedy, gdy ktoś świadomie wybrał podmiot w filtrze.
        const entityCondition = ToolsDb.makeOrConditionFromValueOrArray1(
            searchParams._entities,
            'Persons',
            'EntityId',
            'id',
        );
        if (entityCondition !== '1') conditions.push(entityCondition);

        // Pusty wybór w filtrze dociera tu jako '' albo 0 - to znaczy "bez zawężania",
        // a nie "rola o numerze zero". Powtarzamy całe COALESCE, bo w WHERE nie da się
        // odwołać do aliasu kolumny wyliczanej w SELECT.
        const systemRoleId = Number(searchParams.systemRoleId);
        if (Number.isInteger(systemRoleId) && systemRoleId > 0)
            conditions.push(
                mysql.format(
                    'COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) = ?',
                    [systemRoleId]
                )
            );

        // E-mail systemowy w szukanej frazie, bo to on jest pokazany w wierszu listy
        // (komórka „Osoba"); szukanie po czymś, czego nie widać, myliłoby użytkownika.
        if (searchParams.searchText) {
            const words = searchParams.searchText
                .split(' ')
                .filter((word) => word.length > 0);
            words.forEach((word) =>
                conditions.push(
                    mysql.format(
                        '(Persons.Name LIKE ? OR Persons.Surname LIKE ? OR Persons.Email LIKE ? OR COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) LIKE ?)',
                        [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]
                    )
                )
            );
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Zapis flag. UPSERT, nie UPDATE - wiersz może jeszcze nie istnieć, a kluczem
     * jest PersonId (UNIQUE), nie Id. Jedna instrukcja, więc transakcja zbędna.
     */
    async upsertInDb(
        entity: StaffMember,
        externalConn?: mysql.PoolConnection
    ): Promise<any> {
        const sql = `INSERT INTO StaffMembers
                (PersonId, IsDriver, IsInScrum, HasCostInvoiceAccess,
                 HasBankAccess, CanLogSiteVisits, IsActive)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                IsDriver = VALUES(IsDriver),
                IsInScrum = VALUES(IsInScrum),
                HasCostInvoiceAccess = VALUES(HasCostInvoiceAccess),
                HasBankAccess = VALUES(HasBankAccess),
                CanLogSiteVisits = VALUES(CanLogSiteVisits),
                IsActive = VALUES(IsActive)`;

        return await ToolsDb.executeSQL(
            sql,
            [
                entity.personId,
                entity.isDriver ? 1 : 0,
                entity.isInScrum ? 1 : 0,
                entity.hasCostInvoiceAccess ? 1 : 0,
                entity.hasBankAccess ? 1 : 0,
                entity.canLogSiteVisits ? 1 : 0,
                entity.isActive ? 1 : 0,
            ],
            externalConn
        );
    }

    /*
     * Zapisu roli tu NIE MA - celowo (pack PER, 2026-09-03). Dawniej repozytorium panelu
     * robiło własny UPDATE roli w Persons i PersonAccounts. To była druga droga zapisu
     * konta obok PUT /v2/persons/:personId/account i tylko tamta unieważnia sesje po
     * zmianie roli, zakłada domyślne flagi dla roli i kolejkuje push do FIDmana; dwie
     * drogi zdążyły rozjechać rolę u 6 osób. Konto zapisuje wyłącznie trasa v2.
     */

    protected mapRowToModel(row: RowDataPacket): StaffMember {
        return new StaffMember({
            // Tożsamością rekordu uprawnień JEST osoba, nie wiersz w StaffMembers.
            // Wiersz może w ogóle nie istnieć (seed objął tylko część ról), a klient
            // składa adres zapisu jako `${trasa}/${id}`. Dlatego id = PersonId.
            id: row.PersonId,
            personId: row.PersonId,
            isDriver: !!row.IsDriver,
            isInScrum: !!row.IsInScrum,
            hasCostInvoiceAccess: !!row.HasCostInvoiceAccess,
            hasBankAccess: !!row.HasBankAccess,
            canLogSiteVisits: !!row.CanLogSiteVisits,
            isActive: !!row.IsActive,
            _personName: row.Name,
            _personSurname: row.Surname,
            _personEmail: row.Email,
            _entityName: row.EntityName ?? null,
            _systemRoleId: row.SystemRoleId ?? null,
            _systemEmail: row.SystemEmail ?? null,
            _fidmanEnabled: !!row.FidmanEnabled,
            _hasStaffRow: row.StaffMemberId !== null && row.StaffMemberId !== undefined,
            _fidmanSync: this.mapFidmanSync(row),
        });
    }

    /**
     * Stan ostatniej wysyłki konta do FIDmana (D-PER-8). Payload wiersza niesie `enabled`,
     * więc z tego samego wiersza wiadomo, czy wysyłka włączała, czy wyłączała konto - bez
     * tego plakietka „błąd" nie umiałaby powiedzieć, co się nie udało. Parsowanie w JS,
     * nie JSON_VALUE w SQL: nie zakładamy wersji MariaDB na produkcji.
     */
    private mapFidmanSync(row: RowDataPacket): FidmanUserSyncStatus | null {
        if (!row.FidmanSyncStatus) return null;
        let requestedEnabled: boolean | null = null;
        try {
            const payload =
                typeof row.FidmanPayload === 'string'
                    ? JSON.parse(row.FidmanPayload)
                    : row.FidmanPayload;
            if (typeof payload?.enabled === 'boolean')
                requestedEnabled = payload.enabled;
        } catch (error) {
            // Uszkodzony payload = nie wiadomo, czego dotyczyła wysyłka; status i tak pokazujemy.
        }
        return {
            status: row.FidmanSyncStatus,
            requestedEnabled,
            skipReason: row.FidmanSkipReason ?? null,
            skipReasonLabel: fidmanSkipReasonLabel(row.FidmanSkipReason ?? null),
            lastError: row.FidmanLastError ?? null,
            attempts: row.FidmanAttempts ?? 0,
            updatedAt: row.FidmanUpdatedAt ?? null,
        };
    }
}
