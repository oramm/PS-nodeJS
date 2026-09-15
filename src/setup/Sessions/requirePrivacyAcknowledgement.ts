import { NextFunction, Request, Response } from 'express';
import PrivacyController from '../../persons/privacy/PrivacyController';
import { PrivacyError } from '../../persons/privacy/PrivacyNotice';
export default async function requirePrivacyAcknowledgement(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    const bypass = [
        'POST /login', 'POST /logout', 'GET /session', 'GET /oauthcallback',
        'POST /client-error', 'GET /v2/privacy/system', 'POST /v2/privacy/system/acknowledgements',
    ];
    if (!req.session?.userData || res.locals.authenticatedMachine === true ||
        path.startsWith('/v2/public/') || bypass.includes(req.method.toUpperCase() + ' ' + path)) return next();
    try {
        await PrivacyController.requireAcknowledgement(req.session.userData.enviId, 'SYSTEM');
        next();
    } catch (error) {
        if (error instanceof PrivacyError) res.status(error.httpStatus).send({ errorCode: error.code, errorMessage: error.message });
        else res.status(503).send({ errorCode: 'PRIVACY_UNAVAILABLE', errorMessage: 'Nie można sprawdzić potwierdzenia. Spróbuj ponownie.' });
    }
}

