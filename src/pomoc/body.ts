import express, { ErrorRequestHandler } from 'express';

export const pomocJson = express.json({ limit: '256kb' });
export const pomocBodyError: ErrorRequestHandler = (error, _req, res, next) => {
    if (error?.type === 'entity.too.large') {
        res.status(413).send({ errorMessage: 'Zapytanie do Pomocy przekracza 256 kB.' });
    } else if (error?.type === 'entity.parse.failed') {
        res.status(400).send({ errorMessage: 'Nieprawidłowe zapytanie JSON.' });
    } else next(error);
};
