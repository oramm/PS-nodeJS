import ProfileSkillController from './ProfileSkillController';
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
    '/v2/persons/:personId/profile/skills/search',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            const orConditions = Array.isArray(payload?.orConditions)
                ? payload.orConditions
                : [];
            const skills = await ProfileSkillController.find(
                personId,
                orConditions,
            );
            res.send(skills);
        } catch (error) {
            next(error);
        }
    },
);

app.post(
    '/v2/persons/:personId/profile/skills',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const payload = req.parsedBody ?? req.body;
            if (!payload?.skillId || typeof payload.skillId !== 'number') {
                throw new Error('skillId is required and must be a number');
            }
            const skill = await ProfileSkillController.addFromDto(personId, {
                skillId: payload.skillId,
                levelCode: payload.levelCode,
                yearsOfExperience: payload.yearsOfExperience,
                sortOrder: payload.sortOrder,
            });
            res.send(skill);
        } catch (error) {
            next(error);
        }
    },
);

app.put(
    '/v2/persons/:personId/profile/skills/:skillEntryId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const skillEntryId = parsePositiveInt(
                req.params.skillEntryId,
                'skillEntryId',
            );
            const payload = req.parsedBody ?? req.body;
            const skill = await ProfileSkillController.editFromDto(
                personId,
                skillEntryId,
                {
                    skillId: payload?.skillId,
                    levelCode: payload?.levelCode,
                    yearsOfExperience: payload?.yearsOfExperience,
                    sortOrder: payload?.sortOrder,
                },
            );
            res.send(skill);
        } catch (error) {
            next(error);
        }
    },
);

app.delete(
    '/v2/persons/:personId/profile/skills/:skillEntryId',
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            const skillEntryId = parsePositiveInt(
                req.params.skillEntryId,
                'skillEntryId',
            );
            const result = await ProfileSkillController.deleteFromDto(
                personId,
                skillEntryId,
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);
