import { Request, Response } from 'express';
import { app } from '../../index';
import ContractTemplatesTreeController from './ContractTemplatesTreeController';

/**
 * Router drzewa struktury umowy - warstwa HTTP.
 * Tłumaczy HTTP na JEDNO wywołanie Controllera, bez logiki biznesowej.
 */

app.get('/contractTemplatesTree', async (req: Request, res: Response, next) => {
    try {
        const contractTypeId = Number(req.query.contractTypeId);
        if (!contractTypeId)
            throw new Error('Parametr contractTypeId jest wymagany');

        const result =
            await ContractTemplatesTreeController.findTree(contractTypeId);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
