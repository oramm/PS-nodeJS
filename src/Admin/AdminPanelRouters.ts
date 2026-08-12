import { Request, Response } from 'express';
import { app } from '../index';
import adminPanelGuard, { hasAdminPanelAccess } from './adminPanelGuard';

/**
 * Wejście do panelu administracyjnego.
 *
 * KOLEJNOŚĆ MA ZNACZENIE: Express dopasowuje warstwy w kolejności rejestracji,
 * więc ten plik MUSI być wymagany jako pierwszy w sekcji Admin w index.ts.
 * Inaczej trasy panelu zarejestrowane wcześniej ominą bramkę.
 */

/**
 * Pytanie o dostęp - rejestrowane PRZED bramką, żeby samo nie kończyło się 403.
 * Frontend używa tego do warunkowego pokazania pozycji menu.
 */
app.get('/admin/access', (req: Request, res: Response) => {
    res.send({ hasAccess: hasAdminPanelAccess(req) });
});

// Bramka całego panelu - wszystko poniżej wymaga roli ADMIN lub ENVI_MANAGER.
app.use('/admin', adminPanelGuard);
