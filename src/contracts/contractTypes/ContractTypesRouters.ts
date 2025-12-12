import ContractTypesController from './ContractTypesController';
import { app } from '../../index';
import PersonsController from '../../persons/PersonsController';

/**
 * Router dla typów kontraktów
 * Przepływ: Router → Controller → Repository → Model
 * Router NIE tworzy instancji Model - deleguje do Controller
 */

app.post('/contractTypes', async (req: any, res: any, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ContractTypesController.find(orConditions);
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error) res.status(500).send(err.message);
    }
});

app.post('/contractType', async (req: any, res: any, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        const result = await ContractTypesController.addFromDto({
            ...req.parsedBody,
            _editor,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/contractType/:id', async (req: any, res: any, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        const result = await ContractTypesController.editFromDto({
            ...req.parsedBody,
            _editor,
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/contractType/:id', async (req: any, res: any, next) => {
    try {
        const result = await ContractTypesController.deleteFromDto(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
