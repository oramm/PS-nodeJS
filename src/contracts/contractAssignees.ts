/**
 * JEDYNE miejsce reguły "kto jest przypisany do kontraktu": kierownik + administrator umowy
 * (OurContractsData.ManagerId / AdminId) plus ewentualne osoby dodatkowe (np. zakładający pokój).
 * Używają jej pokoje Google Chat i dostęp do skrzynek poczty (plan MBX, MBX-2).
 */
export function contractAssigneeIds(
    managerId: number | null | undefined,
    adminId: number | null | undefined,
    ...extra: (number | null | undefined)[]
): number[] {
    return Array.from(
        new Set(
            [managerId, adminId, ...extra].filter(
                (id): id is number => typeof id === 'number' && id > 0,
            ),
        ),
    );
}
