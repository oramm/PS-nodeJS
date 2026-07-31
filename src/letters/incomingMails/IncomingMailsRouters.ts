import { Request, Response } from 'express';
import { app } from '../../index';
import IncomingMail from './IncomingMail';
import IncomingMailsController from './IncomingMailsController';

/**
 * Rejestruje kopertę (mail przychodzący) albo oddaje tę, która już jest.
 *
 * Odpowiedź `{ isNew: false }` to pominięcie, nie sukces: ten mail był już przerobiony.
 * Rejestrację pisma wolno puścić dalej tylko wtedy, gdy koperta nie ma jeszcze pisma
 * (`mail._lettersCount === 0`) — to ścieżka reklasyfikacji z G-PRZ-5.
 */
app.post('/incomingMail', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const item = new IncomingMail(req.parsedBody);
        const result = await IncomingMailsController.register(
            item,
            req.session.userData
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});
