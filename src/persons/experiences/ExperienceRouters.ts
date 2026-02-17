import ExperienceController from './ExperienceController';
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
    '/v2/persons/:personId/profile/experiences/search',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(
                req.params.personId,
                'personId',
            );
            const payload = req.parsedBody ?? req.body;
            const orConditions = Array.isArray(payload?.orConditions)
                ? payload.orConditions
                : [];
            const experiences = await ExperienceController.find(
                personId,
                orConditions,
            );
            res.send(experiences);
        } catch (error) {
            next(error);
        }
    },
);

app.post(
    '/v2/persons/:personId/profile/experiences',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(
                req.params.personId,
                'personId',
            );
            const payload = req.parsedBody ?? req.body;
            const experience = await ExperienceController.addFromDto(
                personId,
                {
                    organizationName: payload?.organizationName,
                    positionName: payload?.positionName,
                    description: payload?.description,
                    dateFrom: payload?.dateFrom,
                    dateTo: payload?.dateTo,
                    isCurrent: payload?.isCurrent,
                    sortOrder: payload?.sortOrder,
                },
            );
            res.send(experience);
        } catch (error) {
            next(error);
        }
    },
);

app.put(
    '/v2/persons/:personId/profile/experiences/:experienceId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(
                req.params.personId,
                'personId',
            );
            const experienceId = parsePositiveInt(
                req.params.experienceId,
                'experienceId',
            );
            const payload = req.parsedBody ?? req.body;
            const experience = await ExperienceController.editFromDto(
                personId,
                experienceId,
                {
                    organizationName: payload?.organizationName,
                    positionName: payload?.positionName,
                    description: payload?.description,
                    dateFrom: payload?.dateFrom,
                    dateTo: payload?.dateTo,
                    isCurrent: payload?.isCurrent,
                    sortOrder: payload?.sortOrder,
                },
            );
            res.send(experience);
        } catch (error) {
            next(error);
        }
    },
);

app.delete(
    '/v2/persons/:personId/profile/experiences/:experienceId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(
                req.params.personId,
                'personId',
            );
            const experienceId = parsePositiveInt(
                req.params.experienceId,
                'experienceId',
            );
            const result = await ExperienceController.deleteFromDto(
                personId,
                experienceId,
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);
