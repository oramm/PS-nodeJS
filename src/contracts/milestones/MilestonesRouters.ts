import SharingRouter from './sharing/MilestoneSharingRouters';
import ConsolidationPreviewRouter from './consolidation/ConsolidationPreviewRouters';
import MilestonesController from './MilestonesController';
import { MilestoneParentType } from '../../types/types';
import { app } from '../../index';
import { Request, Response } from 'express';
import MilestoneDatesController from './cases/milestoneDate/MilestoneDatesController';
import ContractsController from '../ContractsController';

app.use(SharingRouter);
app.use(ConsolidationPreviewRouter);

app.post('/milestones', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        // `parentType` można podać top-level albo jako `milestoneParentType` w pierwszym
        // warunku — spójnie z kształtem zapytania używanym przez klienta dla /cases (tam typ
        // rodzica jest wnioskowany z contractId). Dzięki temu klient może pytać o kamienie
        // oferty samym `orConditions`, bez dodatkowego pola w ciele żądania.
        const parentType = (req.parsedBody.parentType ??
            orConditions?.[0]?.milestoneParentType) as MilestoneParentType;
        const result = await MilestonesController.find(
            orConditions,
            parentType,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestoneDates', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const parentType = req.parsedBody.parentType as MilestoneParentType;
        const result = await MilestoneDatesController.find(
            orConditions,
            parentType,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestone', async (req: Request, res: Response, next) => {
    try { res.send(await MilestonesController.addFromDto(req.parsedBody, req.session.userData)); }
    catch (error) { next(error); }
});

app.put('/milestone/:id', async (req: Request, res: Response, next) => {
    try { res.send(await MilestonesController.editFromDto(req.params.id, req.parsedBody, req.session.userData)); }
    catch (error) { next(error); }
});

app.put('/milestoneDateMilestone/:id', async (req: Request, res: Response, next) => {
    try {
        res.send(await MilestonesController.editThroughDateFromDto(req.params.id, req.parsedBody, req.session.userData));
    } catch (error) { next(error); }
});

app.put('/milestoneDateContract/:id', async (req: Request, res: Response, next) => {
    try { res.send(await ContractsController.editThroughMilestoneDateFromDto(req.params.id, req.parsedBody)); }
    catch (error) { next(error); }
});

app.put('/milestoneDate/:id', async (req: Request, res: Response, next) => {
    try {
        res.send(await MilestoneDatesController.editFromDto(
            req.params.id, req.parsedBody, req.session.userData));
    } catch (error) {
        next(error);
    }
});

app.delete('/milestone/:id', async (req: Request, res: Response, next) => {
    try { res.send(await MilestonesController.deleteFromDto(req.params.id, req.parsedBody || req.body)); }
    catch (error) { next(error); }
});

app.delete('/milestoneDate/:id', async (req: Request, res: Response, next) => {
    try {
        res.send(await MilestoneDatesController.deleteFromDto(
            req.params.id, req.parsedBody, req.session.userData));
    } catch (error) {
        next(error);
    }
});
