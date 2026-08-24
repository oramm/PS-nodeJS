import { Request } from 'express';
import { SystemRoleName } from '../../types/sessionTypes';

/**
 * Bramka PODGLADU hierarchii typow.
 *
 * DLACZEGO OSOBNO OD `adminPanelGuard`. Panel administracyjny zostaje zamkniety dla
 * ADMIN i ENVI_MANAGER - to tam sie EDYTUJE. Sam obraz hierarchii jest natomiast
 * potrzebny kazdemu pracownikowi ENVI, wiec odczyt dostaje wlasna, szersza bramke,
 * a nie rozluznienie tamtej.
 *
 * Musi odpowiadac `MainSetup.STAFF_ROLES` po stronie frontu - inaczej menu pokazuje
 * pozycje prowadzaca w 403.
 */
export const TYPES_TREE_READ_ROLES: SystemRoleName[] = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
    SystemRoleName.ENVI_EMPLOYEE,
];

export function hasTypesTreeReadAccess(req: Request): boolean {
    const userData = (req as any).session?.userData;
    return Boolean(userData && TYPES_TREE_READ_ROLES.includes(userData.systemRoleName));
}
