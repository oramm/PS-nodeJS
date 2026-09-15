import { app } from '../../index';
import PrivacyController from './PrivacyController';
import { PrivacyError } from './PrivacyNotice';
for (const method of ['get', 'post'] as const) {
    app[method]('/v2/privacy/system' + (method === 'post' ? '/acknowledgements' : ''), async (req, res, next) => {
        try {
            const id = req.session?.userData?.enviId ?? 0;
            const result = method === 'get'
                ? await PrivacyController.status(id, 'SYSTEM')
                : await PrivacyController.acknowledge(id, 'SYSTEM', req.body);
            res.send(result);
        } catch (error) {
            if (error instanceof PrivacyError) res.status(error.httpStatus).send({ errorCode: error.code, errorMessage: error.message });
            else next(error);
        }
    });
}


