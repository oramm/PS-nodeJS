import express, { Request, Response } from 'express';
import ToolsGd from '../../tools/ToolsGd';
import ToolsGapi, { oAuthClient } from './ToolsGapi';
import { app } from '../..';
import '../../types/sessionTypes';
import TaskStore from './IntersessionsTasksStore';
import ToolsMail from '../../tools/ToolsMail';

app.post('/login', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.loginHandler(req, res);
        console.log(`user: ${JSON.stringify(req.session.userData)} logged in`);
        res.send(req.session);
    } catch (error) {
        if (error instanceof Error)
            res.status(401).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.send({ message: 'Logged out' });
    });
});

/**do sprawdzenia czy użytokwnik jest już wcześniej zalogoway */
app.get('/session', (req: Request, res: Response) => {
    if (req.session?.userData) {
        res.send({ userData: req.session.userData });
    } else {
        res.status(401).send({ errorMessage: 'Brak aktywnej sesji' });
    }
});

app.get('/sessionTaskStatus/:taskId', (req: Request, res: Response) => {
    const taskId = req.params.taskId;
    const task = TaskStore.get(taskId);
    if (!task) return res.status(404).send({ error: 'Nie znaleziono taska' });
    const { timeout, ...taskWithoutTimeout } = task;
    res.send(taskWithoutTimeout);

    // usuń po odebraniu, jeśli zakończony
    if (['done', 'error'].includes(task.status)) {
        TaskStore.remove(taskId);
    }
});

app.post('/client-error', async (req: Request, res: Response) => {
    try {
        await ToolsMail.sendClientErrorReport(req);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Błąd podczas wysyłania raportu błędu klienta:', error);
        res.status(500).json({ error: 'Nie udało się wysłać raportu błędu' });
    }
});

//ostatnio dodane - działa poprawnie
app.post('/get-token', async (req: Request, res: Response, next) => {
    try {
        let credentials =
            req.session.credentials ||
            (await ToolsGapi.getNewCredentials(process.env.REFRESH_TOKEN!));

        req.session.credentials = credentials;
        console.log('Credentials:', req.session.credentials);
        // Sprawdź, czy token istnieje i jest aktualny
        if (
            !credentials ||
            ToolsGapi.calculateTimeToExpiry(credentials.expiry_date) <= 0
        ) {
            if (credentials && credentials.refresh_token) {
                // Ustaw refresh token w OAuth2Client
                oAuthClient.setCredentials({
                    refresh_token: credentials.refresh_token,
                });

                // Użyj getAccessToken, aby automatycznie odświeżyć token
                const tokenInfo = await oAuthClient.getAccessToken();

                if (!tokenInfo.token) {
                    return res
                        .status(401)
                        .json({ error: 'Authorization required' });
                }

                // Zaktualizuj credentials w sesji i zwróć access_token
                req.session.credentials = oAuthClient.credentials;
                credentials = oAuthClient.credentials;
            } else {
                return res
                    .status(401)
                    .json({ error: 'Authorization required' });
            }
        }

        // Zwróć access token klientowi
        res.json({ accessToken: credentials.access_token });
    } catch (error) {
        console.error('Error fetching access token:', error);
        res.status(500).send('Error fetching access token');
    }
});

/**odpalany przez google po przyznaniu dostepu przez użytkownika Google
 */
app.get('/oauthcallback', async (req: Request, res: Response, next) => {
    try {
        const credentials = await ToolsGapi.getNewCredentials(
            process.env.REFRESH_TOKEN!
        );
        ToolsGd.getFilesMetaData(oAuthClient, 'root');
        console.log('/oauthcallback %o', req.session.userData);
        //req.session.userData = await ToolsGapi.getAdminGoogleUserPayload();
        res.send(req.session);
    } catch (error) {
        next(error);
    }
});

oAuthClient.on('tokens', async (tokens) => {
    console.log('tokens event triggered: oAuthClient.credentials');

    if (tokens.refresh_token) {
        console.log('new refreshToken:' + tokens.refresh_token);
    }
    oAuthClient.setCredentials(tokens);
});
