import CasesController from './CasesController';
import { app } from '../../../index';
import Case from './Case';
import Setup from '../../../setup/Setup';
import { Request, Response } from 'express';

/** Waliduje wartość statusu sprawy z klienta. Zwraca komunikat błędu albo undefined. */
function validateCaseStatus(status: unknown): string | undefined {
    if (status === undefined) return undefined;
    const validStatuses = Object.values(Setup.CaseStatus);
    if (typeof status !== 'string' || !validStatuses.includes(status))
        return `Nieprawidłowy status sprawy: ${status}. Dozwolone: ${validStatuses.join(', ')}`;
    return undefined;
}

app.post('/cases', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await CasesController.find(orConditions);
        res.send(result);
    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(err.message);
            console.error(err);
        }
    }
});

app.post('/case', async (req: Request, res: Response, next) => {
    try {
        const statusError = validateCaseStatus(req.parsedBody.status);
        if (statusError) {
            res.status(400).send(statusError);
            return;
        }
        const caseItem = new Case({
            ...req.parsedBody,
        });

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        const result = await CasesController.add(caseItem);

        res.send(result.caseItem);
    } catch (error) {
        next(error);
    }
});

app.put('/case/:id', async (req: Request, res: Response, next) => {
    try {
        const statusError = validateCaseStatus(req.parsedBody.status);
        if (statusError) {
            res.status(400).send(statusError);
            return;
        }
        const itemFromClient = req.parsedBody;
        let item = new Case(itemFromClient);
        if (item._wasChangedToUniquePerMilestone)
            item.setAsUniquePerMilestone();

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        const result = await CasesController.edit(
            item,
            undefined,
            req.parsedBody._fieldsToUpdate
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/case/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Case(req.body);
        console.log('delete');

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        await CasesController.delete(item);

        res.send(item);
    } catch (error) {
        next(error);
    }
});
