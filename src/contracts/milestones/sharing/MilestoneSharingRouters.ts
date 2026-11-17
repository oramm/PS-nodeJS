import { Router } from 'express';
import Controller from './MilestoneSharingController';
import SharingError from './MilestoneSharingError';

const router = Router();
router.get('/milestones/sharing/contract-candidates', async (req, res, next) => {
    try {
        res.send(await Controller.contractCreationCandidates(req.query.projectOurId,
            req.query.contractTypeId, req.session?.userData, req.projectScope));
    } catch (error) { next(error); }
});
router.get('/milestones/:milestoneId/sharing', async (req, res, next) => {
    try {
        res.send(await Controller.get(req.params.milestoneId, req.session?.userData, req.projectScope));
    } catch (error) { next(error); }
});
for (const method of ['put', 'delete'] as const) {
    router[method]('/milestones/:milestoneId/sharing/contracts/:contractId', async (req, res, next) => {
        try {
            res.send(await Controller.mutate(req.params.milestoneId, req.params.contractId,
                method === 'put' ? 'PUT' : 'DELETE', req.parsedBody || req.body, req.session?.userData, req.projectScope));
        } catch (error) { next(error); }
    });
}
router.use((error: any, _req: any, res: any, next: any) => {
    if (!(error instanceof SharingError)) return next(error);
    res.status(error.status).send({ error: { code: error.code, message: error.message, operationId: null,
        retryable: error.status === 503 } });
});
export default router;
