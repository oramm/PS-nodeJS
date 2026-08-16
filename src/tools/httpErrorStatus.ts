/**
 * Klasyfikacja błędu na status HTTP dla globalnego middleware w index.ts.
 *
 * Wydzielone z index.ts, bo od tego zależą dwie rzeczy poza samą odpowiedzią:
 * klient (ToolsFetch.isNonRetryable) ponawia żądanie dla 5xx, a statusy >= 500
 * wysyłają mail-raport do zespołu. Pomyłka użytkownika nie może trafić do żadnej
 * z tych ścieżek.
 */
export function resolveHttpErrorStatus(err: unknown): number {
    // Błąd, który sam zna swój status HTTP (np. ForbiddenError z ProjectScopeGuard,
    // walidacja wejścia, DbError z konfliktem unikalności), nie jest awarią serwera.
    const explicitStatus = (err as any)?.status;
    if (
        Number.isInteger(explicitStatus) &&
        explicitStatus >= 400 &&
        explicitStatus < 500
    )
        return explicitStatus;

    // Naruszenie unikalności oraz próba usunięcia wiersza, do którego coś się
    // jeszcze odwołuje, to błędy użytkownika (409).
    if (isDuplicateEntryError(err) || isRowReferencedError(err)) return 409;

    return 500;
}

export function isDuplicateEntryError(err: unknown): boolean {
    return (err as any)?.code === 'ER_DUP_ENTRY';
}

export function isRowReferencedError(err: unknown): boolean {
    const code = (err as any)?.code;
    return code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_ROW_IS_REFERENCED';
}
