import SkillsDictionaryController from './SkillsDictionaryController';
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
    '/v2/skills/search',
    async (req: Request, res: Response, next) => {
        try {
            const payload = req.parsedBody ?? req.body;
            const orConditions = payload?.orConditions;
            const searchText =
                Array.isArray(orConditions) && orConditions.length > 0
                    ? orConditions[0].searchText
                    : undefined;
            const skills = await SkillsDictionaryController.find(
                searchText ? { searchText } : undefined,
            );
            res.send(skills);
        } catch (error) {
            next(error);
        }
    },
);

app.post(
    '/v2/skills',
    async (req: Request, res: Response, next) => {
        try {
            const payload = req.parsedBody ?? req.body;
            if (!payload?.name || typeof payload.name !== 'string' || !payload.name.trim()) {
                throw new Error('name is required and must be a non-empty string');
            }
            const skill = await SkillsDictionaryController.addFromDto({
                name: payload.name,
            });
            res.send(skill);
        } catch (error) {
            next(error);
        }
    },
);

app.put(
    '/v2/skills/:skillId',
    async (req: Request, res: Response, next) => {
        try {
            const skillId = parsePositiveInt(req.params.skillId, 'skillId');
            const payload = req.parsedBody ?? req.body;
            if (!payload?.name || typeof payload.name !== 'string' || !payload.name.trim()) {
                throw new Error('name is required and must be a non-empty string');
            }
            const skill = await SkillsDictionaryController.editFromDto(
                skillId,
                { name: payload.name },
            );
            res.send(skill);
        } catch (error) {
            next(error);
        }
    },
);

app.delete(
    '/v2/skills/:skillId',
    async (req: Request, res: Response, next) => {
        try {
            const skillId = parsePositiveInt(req.params.skillId, 'skillId');
            const result = await SkillsDictionaryController.delete(skillId);
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);
