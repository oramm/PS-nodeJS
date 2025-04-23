import express, { Request, Response } from 'express';
import ToolsGd from '../../tools/ToolsGd';
import ToolsGapi, { oAuthClient } from './ToolsGapi';
import { app } from '../..';
import '../../types/sessionTypes';

app.post('/login', async (req: Request, res: Response) => {
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

//ostatnio dodane - działa poprawnie
app.post('/get-token', async (req: Request, res: Response) => {
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
app.get('/oauthcallback', async (req: Request, res: Response) => {
    try {
        const credentials = await ToolsGapi.getNewCredentials(
            process.env.REFRESH_TOKEN!
        );
        ToolsGd.getFilesMetaData(oAuthClient, 'root');
        console.log('/oauthcallback %o', req.session.userData);
        //req.session.userData = await ToolsGapi.getAdminGoogleUserPayload();
        res.send(req.session);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

oAuthClient.on('tokens', async (tokens) => {
    console.log('tokens event triggered: oAuthClient.credentials');

    if (tokens.refresh_token) {
        console.log('new refreshToken:' + tokens.refresh_token);
    }
    oAuthClient.setCredentials(tokens);
});
