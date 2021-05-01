import express from 'express'
import ToolsGd from '../../tools/ToolsGd';
import ToolsGapi from './ToolsGapi';
import open from 'open';
import session from 'express-session';
import { keys, oAuthClient, refresh_token } from './ToolsGapi'
import { Envi } from '../../tools/Tools';
import PersonsController from '../../persons/PersonsController';
import { app } from '../..';

/*
 * odpalany przez google po przyznaniu dostepu przez użytkownika Google
 */

app.get('/oauthcallback', async (req: any, res: any) => {
    try {
        const credentials = await ToolsGapi.setNewAccessToken(req);
        ToolsGd.listFiles(oAuthClient);
        req.session.userData = await ToolsGapi.getGoogleUserPayload();
        res.send(req.session);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

oAuthClient.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
        // store the refresh_token in my database!
        let userData: any = await ToolsGapi.getGoogleUserPayload(tokens.id_token as string);
        let userSystemData = await PersonsController.getPersonBySystemEmail(userData.email);
        ToolsGapi.editUserGoogleRefreshTokenInDb(userSystemData?.id as number, tokens.refresh_token);
        console.log('new refreshToken:' + tokens.refresh_token);
    }
    oAuthClient.setCredentials(tokens);
    console.log('tokens event triggered: oAuthClient.credentials %o', oAuthClient.credentials);
});

module.exports = app;