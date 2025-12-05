import RisksController from './RisksController';
import { app } from '../../../../index';
import { Request, Response } from 'express';

/**
 * Router dla Risks - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 *
 * UWAGA: Moduł Risks obsługuje tylko odczyt (GET) - brak operacji CUD
 */

app.get('/risks', async (req: Request, res: Response, next) => {
    try {
        const result = await RisksController.find(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/risk/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await RisksController.find(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
