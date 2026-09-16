import { app } from '../../index';
import softwareLicenseKeyGuard from '../softwareLicenseKeyGuard';
import SoftwareLicensesController from './SoftwareLicensesController';

// Raw body is intentional: parseObjectsJSON would change keys such as "123" or "null".
// Registered after AdminPanelRouters: ADMIN and ENVI_MANAGER; reveal adds a narrower guard.
app.post('/admin/softwareLicenses', async (req, res, next) => {
    try { res.send(await SoftwareLicensesController.find(req.body?.orConditions)); }
    catch (error) { next(error); }
});
app.post('/admin/softwareLicense', async (req, res, next) => {
    try { res.send(await SoftwareLicensesController.addFromDto(req.body)); }
    catch (error) { next(error); }
});
app.put('/admin/softwareLicense/:id', async (req, res, next) => {
    try { res.send(await SoftwareLicensesController.editFromDto(req.body, req.params.id)); }
    catch (error) { next(error); }
});
app.delete('/admin/softwareLicense/:id', async (req, res, next) => {
    try { res.send(await SoftwareLicensesController.deleteFromDto({ id: req.params.id })); }
    catch (error) { next(error); }
});

// POST expresses an explicit audited action; no cached secret response or ETag.
app.post('/admin/softwareLicense/:id/reveal-key', softwareLicenseKeyGuard, async (req, res, next) => {
    try {
        const result = await SoftwareLicensesController.revealKey(req.params.id, req.session?.userData?.enviId);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(result));
    } catch (error) { next(error); }
});