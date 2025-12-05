import RisksReactionsController from './RisksReactionsController';
import { app } from '../../../../../index';
import { Request, Response } from 'express';

/**
 * Router dla RisksReactions - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 *
 * UWAGA: Moduł obsługuje tylko odczyt (GET) - reakcje na ryzyka
 */

app.get('/risksReactions', async (req: Request, res: Response, next) => {
    try {
        const result = await RisksReactionsController.find(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/risksReaction/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await RisksReactionsController.find(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
