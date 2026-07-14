import multer from 'multer';
import { Request, Response } from 'express';
import { app } from '../index';
import MileageController from './MileageController';

const upload = multer({ storage: multer.memoryStorage() });

app.get(
    '/mileage/vehicles',
    async (req: Request, res: Response, next: any) => {
        try {
            res.send(await MileageController.getVehicles());
        } catch (error) {
            next(error);
        }
    }
);

app.get('/mileage/drivers', async (req: Request, res: Response, next: any) => {
    try {
        if (!req.session.userData)
            throw new Error('Musisz być zalogowany.');
        res.send(
            await MileageController.getDrivers(req.session.userData.enviId)
        );
    } catch (error) {
        next(error);
    }
});

app.post(
    '/mileage/scan-odometer',
    upload.single('file') as any,
    async (req: Request, res: Response, next: any) => {
        try {
            if (!req.file)
                throw new Error('Nie załączono zdjęcia licznika.');
            const previousEndReading = req.body.previousEndReading
                ? Number(req.body.previousEndReading)
                : null;
            const candidates = await MileageController.scanOdometer(
                req.body.vehicleId,
                previousEndReading,
                req.file.buffer
            );
            res.send({ candidates });
        } catch (error) {
            next(error);
        }
    }
);

app.post('/mileage/trip', async (req: Request, res: Response, next: any) => {
    try {
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
