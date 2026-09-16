import { NextFunction, Request, Response } from 'express';
import { SystemRoleName } from '../types/sessionTypes';

// Separate from the broader panel policy: only an identifiable ADMIN may reveal keys.
export default function softwareLicenseKeyGuard(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Cache-Control', 'no-store');
    const user = req.session?.userData;
    if (!user) {
        res.status(401).send({ errorMessage: 'Użytkownik niezalogowany' });
        return;
    }
    if (user.systemRoleName !== SystemRoleName.ADMIN ||
        !Number.isInteger(user.enviId) || user.enviId < 1 || user.enviId > 2147483647) {
        res.status(403).send({ errorMessage: 'Brak uprawnień do odsłonięcia klucza licencyjnego' });
        return;
    }
    next();
}
