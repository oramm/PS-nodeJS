import express, { Request, Response } from 'express';
import MilestoneTypesController from './MilestoneTypesController';
import { app } from '../../../index';
import MilestoneType from './MilestoneType';

/**
 * Router dla MilestoneTypes - warstwa HTTP
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Najcieńsza warstwa - tłumaczy HTTP na wywołania Controller
 * - Wywołuje JEDNĄ metodę Controllera per endpoint
 * - Zwraca odpowiedź HTTP
 * - NIE tworzy instancji Model
 * - NIE wywołuje Repository bezpośrednio
 * - NIE zawiera logiki biznesowej
 */

/**
 * GET /milestoneTypes - Pobiera listę MilestoneTypes
 * Endpoint: POST (ze względu na body z orConditions)
 */
app.post('/milestoneTypes', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await MilestoneTypesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /milestoneType - Dodaje nowy MilestoneType
 */
app.post('/milestoneType', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }

        const item = new MilestoneType(req.parsedBody);
        const result = await MilestoneTypesController.add(
            item,
            undefined, // auth - nie potrzebny dla MilestoneType
            req.session.userData // userData - Controller ustawi _editor
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /milestoneType/:id - Aktualizuje istniejący MilestoneType
 */
app.put('/milestoneType/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }

        const item = new MilestoneType(req.parsedBody);
        const result = await MilestoneTypesController.edit(
            item,
            undefined, // auth - nie potrzebny dla MilestoneType
            req.session.userData // userData - Controller ustawi _editor
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /milestoneType/:id - Usuwa MilestoneType
 */
app.delete('/milestoneType/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new MilestoneType(req.body);
        await MilestoneTypesController.delete(item);
        res.send(item);
    } catch (error) {
        next(error);
    }
});
