import { app } from '../../index';
import StaffMembersController from './StaffMembersController';

/**
 * Trasy uprawnień personelu.
 * Prefiks /admin - bramkowane przez adminPanelGuard (ADMIN + ENVI_MANAGER).
 *
 * Brak POST i DELETE celowo: panel edytuje flagi istniejących osób,
 * nie zakłada i nie kasuje ludzi. Parametr :personId to Persons.Id.
 */

app.post('/admin/staffMembers', async (req: any, res: any, next: any) => {
    try {
        const result = await StaffMembersController.find(
            req.parsedBody?.orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put(
    '/admin/staffMember/:personId',
    async (req: any, res: any, next: any) => {
        try {
            const result = await StaffMembersController.editFromDto({
                ...req.parsedBody,
                personId: req.params.personId,
            });
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);
