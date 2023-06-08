import express, { Request, Response } from 'express';
import ToolsGd from '../../tools/ToolsGd';
import ToolsGapi, { oAuthClient } from './ToolsGapi'
import { app } from '../..';
import './sessionTypes';

app.post('/login', async (req: Request, res: Response) => {
    try {
        await ToolsGapi.loginHandler(req, res);
        console.log(`user: ${JSON.stringify(req.session.userData)} logged in`);
        res.send(req.session);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

/**odpalany przez google po przyznaniu dostepu przez użytkownika Google
 */
app.get('/oauthcallback', async (req: Request, res: Response) => {
    try {
        const credentials = await ToolsGapi.setNewAccessToken(req);
        ToolsGd.listFiles(oAuthClient);
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
        // store the refresh_token in my database!
        //ToolsGapi.editUserGoogleRefreshTokenInDb(userSystemData?.id as number, tokens.refresh_token);
        console.log('new refreshToken:' + tokens.refresh_token);
    }
    oAuthClient.setCredentials(tokens);
    //console.log('tokens event triggered: oAuthClient.credentials %o', oAuthClient.credentials);
});