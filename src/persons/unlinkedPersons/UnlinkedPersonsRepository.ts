import ToolsDb from '../../tools/ToolsDb';

/**
 * Osoba, której nic w systemie nie trzyma (4 kryteria planu ROD; pomiar odniesienia: 158 osób na kopii
 * bazy 2026-09-07). Pola z `_` to dane osobowe do trybu `--review`; domyślny raport ich nie drukuje.
 */
export type UnlinkedPerson = {
    id: number;
    entityId: number;
    /**
     * Data ostatniego zapisu wiersza konta (pustego, bez e-maila) albo null, gdy osoba nie ma wiersza
     * konta. To NIE jest data zmiany osoby - `Persons` nie ma kolumny daty (sprostowanie planu,
     * 2026-09-08); dla osób sprzed migracji 002 to jej dzień.
     */
    accountUpdatedAt: Date | null;
    _name: string;
    _surname: string;
    _position: string;
    _entityName: string | null;
};

/**
 * Odczyt osób bez powiązań (ROD-8). Tylko SELECT - raport nic nie zmienia.
 */
export default class UnlinkedPersonsRepository {
    /**
     * Cztery kryteria „bez powiązań" z planu ROD (`D-ROD-4`): bez roli na kontrakcie, bez konta
     * z e-mailem logowania, bez wiersza uprawnień panelu, bez profilu. Wiersz konta BEZ e-maila nie jest
     * powiązaniem - po migracji 002 ma go prawie każda osoba. Ślady działania (pisma, zadania...) liczy
     * osobno `PersonReferencesRepository`; tu tylko kryteria planu, żeby liczba zgadzała się z pomiarem.
     */
    static readonly SQL = `SELECT p.Id, p.Name, p.Surname, p.Position, p.EntityId, e.Name AS EntityName,
            a.UpdatedAt AS AccountUpdatedAt
        FROM Persons p
        LEFT JOIN Entities e ON e.Id = p.EntityId
        LEFT JOIN PersonAccounts a ON a.PersonId = p.Id
        WHERE NOT EXISTS (SELECT 1 FROM Roles r WHERE r.PersonId = p.Id)
          AND NOT EXISTS (SELECT 1 FROM PersonAccounts ae WHERE ae.PersonId = p.Id AND NULLIF(TRIM(ae.SystemEmail), '') IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM StaffMembers s WHERE s.PersonId = p.Id)
          AND NOT EXISTS (SELECT 1 FROM PersonProfiles pp WHERE pp.PersonId = p.Id)
        ORDER BY e.Name, p.Surname, p.Name, p.Id`;

    async find(): Promise<UnlinkedPerson[]> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            UnlinkedPersonsRepository.SQL,
        );
        return (Array.isArray(rows) ? rows : []).map((row: any) =>
            this.mapRowToModel(row),
        );
    }

    async countAllPersons(): Promise<number> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            'SELECT COUNT(*) AS n FROM Persons',
        );
        return Array.isArray(rows) && rows.length
            ? Number((rows[0] as any).n)
            : 0;
    }

    mapRowToModel(row: any): UnlinkedPerson {
        return {
            id: Number(row.Id),
            entityId: Number(row.EntityId),
            accountUpdatedAt: row.AccountUpdatedAt
                ? new Date(row.AccountUpdatedAt)
                : null,
            _name: row.Name ?? '',
            _surname: row.Surname ?? '',
            _position: row.Position ?? '',
            _entityName: row.EntityName ?? null,
        };
    }
}
