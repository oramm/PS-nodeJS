import { Request, Response, NextFunction } from 'express';
import { app } from '../index';
import MileageController from './MileageController';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import { SystemRoleName } from '../types/sessionTypes';
import { ForbiddenError } from '../persons/projectAssignments/ProjectScopeGuard';

/**
 * Dostęp do kilometrówki wynika z flagi StaffMembers.IsDriver, nie z roli systemowej.
 * Pracownicy ENVI mają ją domyślnie włączoną (seed migracji), więc dla nich nic się
 * nie zmienia; pracownik kontraktowy dostaje ją tylko wtedy, gdy ktoś świadomie ją nada.
 */
async function hasModuleAccess(req: Request): Promise<boolean> {
    const personId = req.session.userData?.enviId;
    if (!personId) return false;
    if (
        req.session.userData?.systemRoleName !== SystemRoleName.CONTRACT_WORKER
    )
        return true;
    return StaffMemberRepository.isDriver(personId);
}

async function requireAccess(req: Request): Promise<void> {
    if (!req.session.userData) throw new Error('Musisz być zalogowany.');
    // ForbiddenError, a nie zwykły Error: globalny handler mapuje 5xx na mail z raportem
    // błędu do zespołu, a odmowa dostępu to normalna odpowiedź, nie awaria serwera.
    if (!(await hasModuleAccess(req)))
        throw new ForbiddenError('Brak uprawnień do kilometrówki.');
}

// Czy zalogowany widzi moduł (do warunkowego menu po stronie klienta).
app.get(
    '/mileage/access',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            res.send({ hasAccess: await hasModuleAccess(req) });
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    '/mileage/vehicles',
    async (req: Request, res: Response, next: any) => {
        try {
            await requireAccess(req);
            res.send(await MileageController.getVehicles());
        } catch (error) {
            next(error);
        }
    }
);

app.get('/mileage/drivers', async (req: Request, res: Response, next: any) => {
    try {
        await requireAccess(req);
        res.send(
            await MileageController.getDrivers(req.session.userData!.enviId)
        );
    } catch (error) {
        next(error);
    }
});

app.post('/mileage/trip', async (req: Request, res: Response, next: any) => {
    try {
        await requireAccess(req);
        if (!req.session.userData?.userName)
            throw new Error('Musisz być zalogowany, aby dodać wpis.');
        // Kierowca z formularza (edytowalny), a jak pusty - zalogowany użytkownik.
        const driver =
            (req.parsedBody.driver ?? '').trim() ||
            req.session.userData.userName;
        const trip = await MileageController.addTrip(req.parsedBody, driver);
        res.send(trip);
    } catch (error) {
        next(error);
    }
});
