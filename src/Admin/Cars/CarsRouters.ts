import { app } from '../../index';
import CarsController from './CarsController';

/**
 * Trasy słownika samochodów.
 * Prefiks /admin - bramkowane przez adminPanelGuard (ADMIN + ENVI_MANAGER).
 * Router jest najcieńszą warstwą: nie tworzy Modelu i nie waliduje sam.
 */

app.post('/admin/cars', async (req: any, res: any, next: any) => {
    try {
        const result = await CarsController.find(req.parsedBody?.orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/admin/car', async (req: any, res: any, next: any) => {
    try {
        const result = await CarsController.addFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/admin/car/:id', async (req: any, res: any, next: any) => {
    try {
        const result = await CarsController.editFromDto({
            ...req.parsedBody,
            id: req.params.id,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/admin/car/:id', async (req: any, res: any, next: any) => {
    try {
        const result = await CarsController.deleteFromDto({
            id: req.params.id,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});
