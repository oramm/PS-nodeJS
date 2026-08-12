import { NextFunction, Request, Response } from 'express';
import { SystemRoleName } from '../types/sessionTypes';

/**
 * Bramka panelu administracyjnego.
 *
 * DLACZEGO ROLA, A NIE FLAGA StaffMembers.
 * Panel edytuje właśnie flagi uprawnień. Gdyby dostęp do niego zależał od flagi,
 * wyzerowanie jej sobie odcięłoby jedyną drogę naprawy. Rola systemowa jest
 * nadawana poza panelem, więc administrator zawsze ma powrót.
 */
export const ADMIN_PANEL_ROLES: SystemRoleName[] = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
];

export function hasAdminPanelAccess(req: Request): boolean {
    const role = (req as any).session?.userData?.systemRoleName;
    return !!role && ADMIN_PANEL_ROLES.includes(role);
}

/**
 * Zamyka cały prefiks /admin. Montowana JEDEN raz, przed trasami panelu -
 * dzięki temu trasa dopisana w przyszłości jest domyślnie zamknięta, a nie otwarta.
 */
export default function adminPanelGuard(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!(req as any).session?.userData) {
        res.status(401).send({ errorMessage: 'Użytkownik niezalogowany' });
        return;
    }
    if (!hasAdminPanelAccess(req)) {
        res.status(403).send({
            errorMessage: 'Brak uprawnień do panelu administracyjnego',
        });
        return;
    }
    next();
}
