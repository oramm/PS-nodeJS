import express from 'express'
import ToolsGd from '../../tools/ToolsGd';
import ToolsGapi from './ToolsGapi';
import { oAuthClient } from './ToolsGapi'
import PersonsController from '../../persons/PersonsController';
import { app } from '../..';
import Person from '../../persons/Person';

app.post('/login', async (req: any, res: any) => {
    try {
        const ticket = await oAuthClient.verifyIdToken({
            idToken: req.body.id_token,
            audience: '386403657277-9mh2cnqb9dneoh8lc6o2m339eemj24he.apps.googleusercontent.com', // CLIENT_ID starej aplikacji GAS
        });
        const payload = ticket.getPayload();
        if (payload)
            req.session.userData = { email: payload.email, sub: payload.sub };
        //poozostawić do czasu uzupełnienia bazy o GoogleId
        let person = new Person({ systemEmail: req.session.userData.email });
        let systemRole = await person.getSystemRole();

        if (!systemRole.googleId)
            ToolsGapi.editUserGoogleIdInDb(systemRole.personId as number, req.session.userData.sub);

        console.log(`user: ${JSON.stringify(req.session.userData)}:: ${req.session.id}`);
        res.send(req.session);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.log(error);
    };
});
/*
 * odpalany przez google po przyznaniu dostepu przez użytkownika Google
 */

app.get('/oauthcallback', async (req: any, res: any) => {
    try {
        const credentials = await ToolsGapi.setNewAccessToken(req);
        ToolsGd.listFiles(oAuthClient);
        req.session.userData = await ToolsGapi.getGoogleUserPayload();
        res.send(req.session);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
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