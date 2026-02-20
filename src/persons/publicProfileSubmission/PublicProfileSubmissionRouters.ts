import { Request, Response } from 'express';
import { app, upload } from '../../index';
import PublicProfileSubmissionController from './PublicProfileSubmissionController';
import { ensureStaffAccess } from './PublicProfileSubmissionAuth';
import { PublicProfileSubmissionError } from './PublicProfileSubmissionErrors';

const parsePositiveInt = (raw: string, fieldName: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new PublicProfileSubmissionError(
            `${fieldName} must be a positive integer`,
            'INVALID_PATH_PARAM',
            400,
        );
    }
    return value;
};

const getBearerToken = (req: Request): string => {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return '';
    return auth.slice('Bearer '.length).trim();
};

const handleError = (error: unknown, res: Response, next: Function) => {
    if (error instanceof PublicProfileSubmissionError) {
        if (error.httpStatus === 429 && error.retryAfterSeconds) {
            res.set('Retry-After', String(error.retryAfterSeconds));
        }
        res.status(error.httpStatus).send({
            errorCode: error.code,
            errorMessage: error.message,
        });
        return;
    }
    next(error);
};

app.post(
    '/v2/persons/:personId/experience-updates/link',
    async (req: Request, res: Response, next) => {
        try {
            const requesterPersonId = ensureStaffAccess(req);
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const recipientEmail =
                typeof payload?.recipientEmail === 'string'
                    ? payload.recipientEmail
                    : undefined;
            const sendNow = payload?.sendNow === true;
            const result =
                await PublicProfileSubmissionController.createOrRefreshLink(
                    personId,
                    requesterPersonId,
                    {
                        recipientEmail,
                        sendNow,
                    },
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/persons/:personId/experience-updates/search',
    async (req: Request, res: Response, next) => {
        try {
            ensureStaffAccess(req);
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const status =
                typeof payload?.status === 'string'
                    ? payload.status
                    : undefined;
            const result =
                await PublicProfileSubmissionController.searchSubmissions(
                    personId,
                    status,
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.get(
    '/v2/persons/:personId/experience-updates/:submissionId',
    async (req: Request, res: Response, next) => {
        try {
            ensureStaffAccess(req);
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const submissionId = parsePositiveInt(
                req.params.submissionId,
                'submissionId',
            );
            const result =
                await PublicProfileSubmissionController.getSubmissionDetails(
                    personId,
                    submissionId,
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/persons/:personId/experience-updates/:submissionId/items/:itemId/review',
    async (req: Request, res: Response, next) => {
        try {
            const reviewerPersonId = ensureStaffAccess(req);
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const submissionId = parsePositiveInt(
                req.params.submissionId,
                'submissionId',
            );
            const itemId = parsePositiveInt(req.params.itemId, 'itemId');
            const payload = req.parsedBody ?? req.body;
            const decision = payload?.decision;
            const comment =
                typeof payload?.comment === 'string'
                    ? payload.comment.trim()
                    : undefined;
            if (decision !== 'ACCEPT' && decision !== 'REJECT') {
                throw new PublicProfileSubmissionError(
                    'Decision must be ACCEPT or REJECT',
                    'INVALID_REVIEW_DECISION',
                    400,
                );
            }
            if (decision === 'REJECT' && !comment) {
                throw new PublicProfileSubmissionError(
                    'Comment is required for REJECT',
                    'REVIEW_COMMENT_REQUIRED',
                    400,
                );
            }
            const result = await PublicProfileSubmissionController.reviewItem(
                personId,
                submissionId,
                itemId,
                decision,
                reviewerPersonId,
                comment,
            );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/persons/:personId/experience-updates/:submissionId/close',
    async (req: Request, res: Response, next) => {
        try {
            ensureStaffAccess(req);
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const submissionId = parsePositiveInt(
                req.params.submissionId,
                'submissionId',
            );
            const result =
                await PublicProfileSubmissionController.closeSubmission(
                    personId,
                    submissionId,
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.get(
    '/v2/public/experience-update/:token',
    async (req: Request, res: Response, next) => {
        try {
            const result =
                await PublicProfileSubmissionController.getPublicSubmission(
                    req.params.token,
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/public/experience-update/:token/verify-email/request-code',
    async (req: Request, res: Response, next) => {
        try {
            const payload = req.parsedBody ?? req.body;
            const result =
                await PublicProfileSubmissionController.requestVerifyCode(
                    req.params.token,
                    payload?.email,
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/public/experience-update/:token/verify-email/confirm-code',
    async (req: Request, res: Response, next) => {
        try {
            const payload = req.parsedBody ?? req.body;
            const result =
                await PublicProfileSubmissionController.confirmVerifyCode(
                    req.params.token,
                    payload?.email,
                    payload?.code,
                );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.get(
    '/v2/public/experience-update/:token/draft',
    async (req: Request, res: Response, next) => {
        try {
            const result = await PublicProfileSubmissionController.getDraft(
                req.params.token,
                getBearerToken(req),
            );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.put(
    '/v2/public/experience-update/:token/draft',
    async (req: Request, res: Response, next) => {
        try {
            const payload = req.parsedBody ?? req.body;
            const result = await PublicProfileSubmissionController.updateDraft(
                req.params.token,
                getBearerToken(req),
                payload,
            );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/public/experience-update/:token/analyze-file',
    upload.single('file'),
    async (req: Request, res: Response, next) => {
        try {
            if (!req.file) {
                throw new PublicProfileSubmissionError(
                    'No file uploaded',
                    'FILE_REQUIRED',
                    400,
                );
            }
            const hint =
                typeof req.body?.hint === 'string'
                    ? req.body.hint.trim() || undefined
                    : undefined;
            const result = await PublicProfileSubmissionController.analyzeFile(
                req.params.token,
                getBearerToken(req),
                req.file,
                hint,
            );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);

app.post(
    '/v2/public/experience-update/:token/submit',
    async (req: Request, res: Response, next) => {
        try {
            const result = await PublicProfileSubmissionController.submit(
                req.params.token,
                getBearerToken(req),
            );
            res.send(result);
        } catch (error) {
            handleError(error, res, next);
        }
    },
);
