import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import BaseRepository from '../../repositories/BaseRepository';
import StaffMember from './StaffMember';

export type StaffMembersSearchParams = {
    personId?: number;
    searchText?: string;
    /** Rola systemowa osoby. Brak wartości = bez zawężania. */
    systemRoleId?: number | string;
    /**
     * Brak wartości albo false = tylko osoby z nadanymi uprawnieniami (mające wiersz
     * w StaffMembers). true = wszystkie osoby, także te bez uprawnień.
     *
     * Domyślne zawężenie jest celowe: po wyczyszczeniu filtrów ekran ma pokazywać
     * personel, a nie pełną książkę adresową systemu.
     */
    includeWithoutPermissions?: boolean;
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
     * Rola przez COALESCE, bo potrafi być zapisana tylko na koncie V2.
     */
    async find(
        orConditions: StaffMembersSearchParams[] = [{}]
    ): Promise<StaffMember[]> {
        const sql = `SELECT
                Persons.Id AS PersonId,
                Persons.Name,
                Persons.Surname,
                Persons.Email,
                COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) AS SystemRoleId,
                StaffMembers.Id AS StaffMemberId,
                COALESCE(StaffMembers.IsDriver, 0) AS IsDriver,
                COALESCE(StaffMembers.IsInScrum, 0) AS IsInScrum,
                COALESCE(StaffMembers.HasCostInvoiceAccess, 0) AS HasCostInvoiceAccess,
                COALESCE(StaffMembers.HasBankAccess, 0) AS HasBankAccess,
                COALESCE(StaffMembers.CanLogSiteVisits, 0) AS CanLogSiteVisits,
                COALESCE(StaffMembers.IsActive, 1) AS IsActive
            FROM Persons
            LEFT JOIN StaffMembers ON StaffMembers.PersonId = Persons.Id
            LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id
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

        if (!searchParams.includeWithoutPermissions)
            conditions.push('StaffMembers.Id IS NOT NULL');

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

        if (searchParams.searchText) {
            const words = searchParams.searchText
                .split(' ')
                .filter((word) => word.length > 0);
            words.forEach((word) =>
                conditions.push(
                    mysql.format(
                        '(Persons.Name LIKE ? OR Persons.Surname LIKE ? OR Persons.Email LIKE ?)',
                        [`%${word}%`, `%${word}%`, `%${word}%`]
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

    /**
     * Zmienia rolę systemową osoby.
     *
     * Rola jest czytana przez COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId),
     * bo migracja kont V2 jest w toku i oba źródła żyją równolegle. Piszemy więc w OBA:
     * inaczej wynik zależałby od tego, czy dana osoba ma już konto V2, i ta sama zmiana
     * dawałaby różny efekt dla różnych osób.
     */
    async updateSystemRoleInDb(
        personId: number,
        systemRoleId: number,
        externalConn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.executeSQL(
            'UPDATE Persons SET SystemRoleId = ? WHERE Id = ?',
            [systemRoleId, personId],
            externalConn
        );
        await ToolsDb.executeSQL(
            'UPDATE PersonAccounts SET SystemRoleId = ? WHERE PersonId = ?',
            [systemRoleId, personId],
            externalConn
        );
    }

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
            _systemRoleId: row.SystemRoleId ?? null,
            _hasStaffRow: row.StaffMemberId !== null && row.StaffMemberId !== undefined,
        });
    }
}
