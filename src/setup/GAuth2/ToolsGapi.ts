import session from 'express-session';
import { OAuth2Client } from 'google-auth-library';
import url from 'url';
import Person from '../../persons/Person';
import { Envi } from '../../tools/Tools';
import ToolsDb from '../../tools/ToolsDb';
import { Request, Response, NextFunction } from 'express';
import { keys } from './credentials';


export let refresh_token: string = '1//09de9o3oImgwxCgYIARAAGAkSNwF-L9IrFqZe55vzOdJThCZGCsxoXU7PKWGxHIuYPLcN5lb6FVlzd2LiHuU1RIMUyxy7Hdfwp7g'
export const oAuthClient: OAuth2Client = new OAuth2Client(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0]
);

export default class ToolsGapi {
    static scopes = [
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/userinfo.profile',
        'openid',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ]
    //'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/drive'

    // Generate the url that will be used for the consent dialog.
    static getAuthUrl(oauth2Client: OAuth2Client) {
        if (!oauth2Client)
            oauth2Client = oauth2Client;

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
            prompt: 'consent'
        });
    }

    static calculateTimeToExpiry(expiryDate: number = 0) {
        return (expiryDate - new Date().getTime());
    }

    static async setNewAccessToken(req: any) {
        // acquire the code from the querystring, and close the web server.
        const qs = new url.URL(req.url, 'http://localhost:3000')
            .searchParams;
        const code = qs.get('code');
        console.log(`Code is ${code}`);
        //res.end('Authentication successful! Please return to the console.');

        // Now that we have the code, use that to acquire tokens.
        const r = await oAuthClient.getToken(code as string);
        console.log(r.tokens);
        // Make sure to set the credentials on the OAuth2 client.
        oAuthClient.setCredentials(r.tokens);
        console.info('Tokens acquired.');

        req.session.credentials = oAuthClient.credentials;
        return r.tokens;
    }

    static async loginHandler(req: Request, res: Response) {
        const token = req.body.id_token;

        try {
            if (!token) throw new Error('No token provided');
            const ticket = await oAuthClient.verifyIdToken({
                idToken: token,
                audience: [
                    keys.installed.client_id,
                    '386403657277-9mh2cnqb9dneoh8lc6o2m339eemj24he.apps.googleusercontent.com',
                    '386403657277-21tus25hgaoe7jdje73plc2qbgakht05.apps.googleusercontent.com'],
            });

            const payload = ticket.getPayload();
            if (!payload) throw new Error('No payload provided');
            if (!payload.email) throw new Error(`Twoje konto Google nie ma przypisanego adresu email. 
            Zaloguj się na konto Google i przypisz adres email.`);
            if (!payload.name) throw new Error(`Twoje konto Google nie ma przypisanego imienia i nazwiska.`);
            if (!payload.picture) payload.picture = 'https://www.gravatar.com/avatar/    ?d=mp';

            const systemRole = await this.determineSystemRole(payload.email);

            req.session.userData = {
                googleId: payload.sub,
                systemEmail: payload.email,
                userName: payload.name,
                picture: payload.picture,
                systemRoleName: systemRole.name,
                systemRoleId: systemRole.id,
            };
            console.log('User data set in session:', req.session.userData);
            //jeśli nie ma googleId w bazie danych, to go wpisuje (po pierwszym zalogowaniu)
            if (!systemRole.googleId)
                await ToolsGapi.editUserGoogleIdInDb(systemRole.personId, req.session.userData.googleId);


        } catch (error) {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }

    static async determineSystemRole(email: string) {
        const person = new Person({ systemEmail: email });
        const role = await person.getSystemRole();
        return role;
    }

    static authenticateUser(req: Request, res: Response, next: NextFunction) {
        if (req.session && req.session.userData) {
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }

    /** @deprecated  wymaga przeglądu*/
    static async getAdminGoogleUserPayload() {
        const idToken = oAuthClient.credentials.id_token;
        if (!idToken) throw new Error('No token provided');
        const ticket = await oAuthClient.verifyIdToken({
            idToken: idToken,
            audience: keys.installed.client_id, // Specify the CLIENT_ID of the app that accesses the backend
        });
        const payload = ticket.getPayload();
        return payload
    }

    static async gapiReguestHandler(req: any, res: any, gapiFunction: Function, argObject?: any, thisObject?: any) {
        let result;
        console.log('--------------- authenticate ----------------')
        let credentials: any = req.session.credentials;
        let refreshToken: string;
        //zmieniły się zakresy
        if (credentials && !Envi.ToolsArray.equalsIgnoreOrder(credentials.scope.split(' '), ToolsGapi.scopes)) {
            let authorizeUrl = ToolsGapi.getAuthUrl(oAuthClient);
            return { authorizeUrl: authorizeUrl };
        }
        //pierwsze logowanie zarejestrowanego użytkownika
        if (!req.session.credentials || ToolsGapi.calculateTimeToExpiry(credentials.expiry_date) < 2) {
            //pobierzez refreshToken z bazy
            //----- do przywrócoenia po opanowaniu sesji  CORS
            //const user = new Person({ systemEmail: req.session.userData.email });
            //refreshToken = <string>(await user.getSystemRole()).googleRefreshToken;
            refreshToken = refresh_token;
            //pierwsze logowanie nowego użytkownika
            if (!refreshToken) {
                let authorizeUrl = ToolsGapi.getAuthUrl(oAuthClient);
                return { authorizeUrl: authorizeUrl };
            } else
                credentials = { refresh_token: refreshToken };
        }

        console.log('credentials valid for: %d s', ToolsGapi.calculateTimeToExpiry(credentials.expiry_date) / 1000);
        oAuthClient.setCredentials(credentials);

        const args = [oAuthClient]
        if (typeof argObject === "object" && argObject !== null && argObject !== undefined)
            args.push(...argObject);
        else
            args.push(argObject);

        result = (thisObject) ? await gapiFunction.apply(thisObject, args) : await gapiFunction(...args);
        return result;
    }

    private static async editUserDataInDb(data: { id: number, googleId?: string, googleRefreshToken?: string }) {
        return await ToolsDb.editInDb('Persons', data);
    }
    static async editUserGoogleIdInDb(userId: number, googleId: string) {
        return await this.editUserDataInDb({ id: userId, googleId: googleId })
    }
    static async editUserGoogleRefreshTokenInDb(userId: number, googleRefreshToken: string) {
        return await this.editUserDataInDb({ id: userId, googleRefreshToken: googleRefreshToken })
    }

}