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
            audience: [
                '246174537725-7t658k3s4u5fsi35jjs4si7ukqlnaujb.apps.googleusercontent.com',
                '386403657277-9mh2cnqb9dneoh8lc6o2m339eemj24he.apps.googleusercontent.com',
                '386403657277-21tus25hgaoe7jdje73plc2qbgakht05.apps.googleusercontent.com'
            ], // CLIENT_ID starej aplikacji GAS i erp-ENVI
        });
        const payload = ticket.getPayload();

        if (payload)
            req.session.userData = { systemEmail: payload.email, name: payload.given_name, surname: payload.family_name };
        //pozostawić do czasu uzupełnienia bazy o GoogleId
        let person = new Person({ systemEmail: req.session.userData.systemEmail });
        let systemRole = await person.getSystemRole();

        if (!systemRole.googleId)
            await ToolsGapi.editUserGoogleIdInDb(systemRole.personId as number, req.session.userData.sub);
        console.log(`user: ${JSON.stringify(req.session.userData)} logged in`);
        res.send(req.session);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
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
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }
});

oAuthClient.on('tokens', async (tokens) => {
    console.log('tokens event triggered: oAuthClient.credentials');

    let userData: any = await ToolsGapi.getGoogleUserPayload(tokens.id_token as string);
    let userSystemData = await PersonsController.getPersonBySystemEmail(userData.email);
    if (tokens.refresh_token) {
        // store the refresh_token in my database!
        //ToolsGapi.editUserGoogleRefreshTokenInDb(userSystemData?.id as number, tokens.refresh_token);
        console.log('new refreshToken:' + tokens.refresh_token);
    }
    oAuthClient.setCredentials(tokens);
    //console.log('tokens event triggered: oAuthClient.credentials %o', oAuthClient.credentials);
});