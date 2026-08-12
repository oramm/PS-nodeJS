import { app } from '../../index';
import AbsenceTypesController from './AbsenceTypesController';

/**
 * Trasy słownika typów nieobecności.
 * Prefiks /admin - bramkowane przez adminPanelGuard (ADMIN + ENVI_MANAGER).
 */

app.post('/admin/absenceTypes', async (req: any, res: any, next: any) => {
    try {
        const result = await AbsenceTypesController.find(
            req.parsedBody?.orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/admin/absenceType', async (req: any, res: any, next: any) => {
    try {
        const result = await AbsenceTypesController.addFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/admin/absenceType/:id', async (req: any, res: any, next: any) => {
    try {
        const result = await AbsenceTypesController.editFromDto({
            ...req.parsedBody,
            id: req.params.id,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/admin/absenceType/:id', async (req: any, res: any, next: any) => {
    try {
        const result = await AbsenceTypesController.deleteFromDto({
            id: req.params.id,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});
