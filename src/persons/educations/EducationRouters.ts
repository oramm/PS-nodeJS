import EducationController from './EducationController';
import { app } from '../../index';
import { Request, Response } from 'express';

const parsePositiveInt = (raw: string, fieldName: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return value;
};

app.post(
    '/v2/persons/:personId/profile/educations/search',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const orConditions = Array.isArray(payload?.orConditions)
                ? payload.orConditions
                : [];
            const educations = await EducationController.find(
                personId,
                orConditions,
            );
            res.send(educations);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Dodaje nowy wpis wykształcenia do profilu (v2).
 * Params: personId
 * Body: PersonProfileEducationV2Payload
 * Returns: PersonProfileEducationV2Record
 */
app.post(
    '/v2/persons/:personId/profile/educations',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const education = await EducationController.addFromDto(personId, {
                schoolName: payload?.schoolName,
                degreeName: payload?.degreeName,
                fieldOfStudy: payload?.fieldOfStudy,
                dateFrom: payload?.dateFrom,
                dateTo: payload?.dateTo,
                sortOrder: payload?.sortOrder,
            });
            res.send(education);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Aktualizuje wpis wykształcenia w profilu (v2).
 * Params: personId, educationId
 * Body: PersonProfileEducationV2Payload
 * Returns: PersonProfileEducationV2Record
 */
app.put(
    '/v2/persons/:personId/profile/educations/:educationId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const educationId = parsePositiveInt(
                req.params.educationId,
                'educationId',
            );
            const payload = req.parsedBody ?? req.body;
            const education = await EducationController.editFromDto(
                personId,
                educationId,
                {
                    schoolName: payload?.schoolName,
                    degreeName: payload?.degreeName,
                    fieldOfStudy: payload?.fieldOfStudy,
                    dateFrom: payload?.dateFrom,
                    dateTo: payload?.dateTo,
                    sortOrder: payload?.sortOrder,
                },
            );
            res.send(education);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Usuwa wpis wykształcenia z profilu (v2).
 * Params: personId, educationId
 * Returns: { id }
 */
app.delete(
    '/v2/persons/:personId/profile/educations/:educationId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const educationId = parsePositiveInt(
                req.params.educationId,
                'educationId',
            );
            const result = await EducationController.deleteFromDto(
                personId,
                educationId,
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);
