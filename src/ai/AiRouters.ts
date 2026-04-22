import multer from 'multer';
import { Request, Response } from 'express';
import LettersController from '../letters/LettersController';
import { app } from '../index';

const upload = multer({ storage: multer.memoryStorage() });

app.post(
    '/ai/analyze-document',
    upload.single('file') as any,
    async (req: Request, res: Response, next: any) => {
        try {
            if (!req.file) throw new Error('Nie załączono pliku do analizy.');
            const result = await LettersController.analyzeDocument(req.file);
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);
