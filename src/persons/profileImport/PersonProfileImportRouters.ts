import { app, upload } from '../../index';
import ToolsAI from '../../tools/ToolsAI';
import { Request, Response } from 'express';

const parsePositiveInt = (raw: string, fieldName: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive integer`);
    }
    return value;
};

app.post(
    '/v2/persons/:personId/profile/analyze-file',
    upload.single('file'),
    async (req: Request, res: Response, next) => {
        try {
            const personId = parsePositiveInt(req.params.personId, 'personId');
            if (!req.file) throw new Error('No file uploaded');
            const hint = typeof req.body?.hint === 'string' ? req.body.hint.trim() || undefined : undefined;
            const result = await ToolsAI.analyzePersonProfile(req.file, hint);
            res.send({
                experiences: result.experiences,
                educations: result.educations,
                skills: result.skills,
                _extractedText: result.text,
                _model: result._model,
                _usage: result._usage,
            });
        } catch (error) {
            next(error);
        }
    },
);
