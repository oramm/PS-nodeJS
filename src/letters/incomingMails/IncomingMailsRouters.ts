import { Request, Response } from 'express';
import { app } from '../../index';
import IncomingMail from './IncomingMail';
import IncomingMailsController from './IncomingMailsController';
import MailScansController from './MailScansController';

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

/**
 * Znacznik ostatniego skanu skrzynki: do kiedy przeskanowano, kiedy i kto odpalił.
 *
 * Pusta odpowiedź (`scan: null`) znaczy „tej skrzynki jeszcze nikt nie skanował", a nie
 * „przeskanowano i nic nie było" — wtedy głębokość pierwszego okna podaje owner świadomie.
 */
app.get('/mailScan', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const [scan] = await MailScansController.find([
            {
                account: String(req.query.account ?? ''),
                mailbox: String(req.query.mailbox ?? ''),
            },
        ]);
        res.send({ scan: scan ?? null });
    } catch (error) {
        next(error);
    }
});

/** Przesuwa znacznik — wolno wołać dopiero po zakończonym przebiegu, patrz MailScansController. */
app.post('/mailScan', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const scan = await MailScansController.advance(
            req.parsedBody,
            req.session.userData
        );
        res.send({ scan });
    } catch (error) {
        next(error);
    }
});
