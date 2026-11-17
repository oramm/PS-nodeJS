import { Router } from 'express';
import Controller from './ConsolidationPreviewController';
import Apply from './ConsolidationApplyController';
import Preparation from './ConsolidationPreparationController';
import Status from './ConsolidationStatusController';
import Guidance from './ConsolidationGuidanceController';
import Readiness from './ConsolidationReadinessController';
import Finalization from './ConsolidationFinalizationController';
import History from './ConsolidationHistoryController';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

import Shortcut from './ConsolidationShortcutController';

const router = Router();
router.post('/milestone-consolidations/:operationId/finalize', async (req,res,next)=>{
    try{res.send(await Finalization.addFromDto(req.params.operationId,req.parsedBody??req.body,req.session?.userData,req.projectScope,res.locals,false));}catch(error){next(error);}
});
router.post('/milestone-consolidations/:operationId/retry', async (req,res,next)=>{
    try{res.send(await Finalization.addFromDto(req.params.operationId,req.parsedBody??req.body,req.session?.userData,req.projectScope,res.locals,true));}catch(error){next(error);}
});
router.post('/milestone-consolidations/history-resolution', async(req,res,next)=>{
    try{res.send(await History.resolve(req.parsedBody??req.body,req.session?.userData,req.projectScope,res.locals));}catch(error){next(error);}
});
router.post('/milestone-consolidations/:operationId/shortcuts/:contractId/prepare', async (req, res, next) => {
    try { res.send(await Shortcut.prepare(req.params.operationId, req.params.contractId, req.session?.userData, req.projectScope, res.locals)); }
    catch (error) { next(error); }
});
router.post('/milestone-consolidations/:operationId/check', async (req, res, next) => {
    try { res.send(await Readiness.addFromDto(req.params.operationId, req.parsedBody ?? req.body, req.session?.userData, req.projectScope)); }
    catch (error) { next(error); }
});
router.post('/milestone-consolidations/work-targets', async (req, res, next) => {
    try { res.send(await Guidance.workTargets(req.parsedBody || req.body, req.session?.userData, req.projectScope)); }
    catch (error) { next(error); }
});
router.get('/milestones/:milestoneId/consolidation', async (req, res, next) => {
    try { res.send(await Status.forSource(req.params.milestoneId, req.session?.userData, req.projectScope,res.locals)); }
    catch (error) { next(error); }
});
router.post('/milestone-consolidations/prepare-targets', async (req, res, next) => {
    try { res.send(await Preparation.addFromDto(req.parsedBody || req.body, req.session?.userData, req.projectScope)); }
    catch (error) { next(error); }
});
router.post('/milestone-consolidations/preview', async (req, res, next) => {
    try { res.send(await Controller.addFromDto(req.parsedBody || req.body, req.session?.userData, req.projectScope)); }
    catch (error) { next(error); }
});
router.get('/milestone-consolidations/previews/:previewId', async (req, res, next) => {
    try { res.send(await Controller.get(req.params.previewId, req.session?.userData, req.projectScope)); }
    catch (error) { next(error); }
});
router.post('/milestone-consolidations/previews/:previewId/revalidate', async (req, res, next) => {
    try { res.send(await Controller.get(req.params.previewId, req.session?.userData, req.projectScope, req.parsedBody || req.body || {})); }
    catch (error) { next(error); }
});
router.post('/milestone-consolidations/apply', async (req, res, next) => {
    try { res.send(await Apply.addFromDto(req.parsedBody || req.body, req.session?.userData, req.projectScope,res.locals)); }
    catch (error) { next(error); }
});
router.get('/milestone-consolidations/:operationId', async (req, res, next) => {
    try { res.send(await Status.get(req.params.operationId, req.session?.userData, req.projectScope,res.locals)); }
    catch (error) { next(error); }
});
router.get('/milestone-consolidations/:operationId/notes', async (req, res, next) => {
    try { res.send(await Status.getNotes(req.params.operationId, req.session?.userData, req.projectScope,res.locals)); }
    catch (error) { next(error); }
});
router.use((error: unknown, _req: any, res: any, next: any) => {
    if (!(error instanceof ConsolidationMappingError)) return next(error);
    res.status(error.status).send({ error: { code: error.code, message: error.code, operationId: null, retryable: error.status === 503 } });
});
export default router;
