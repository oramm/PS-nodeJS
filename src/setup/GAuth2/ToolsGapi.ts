import { OAuth2Client } from 'google-auth-library';
import Person from '../../persons/Person';
import { Envi } from '../../tools/Tools';
import ToolsDb from '../../tools/ToolsDb';
import { Request, Response, NextFunction } from 'express';
import { keys } from './credentials';

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
        'https://www.googleapis.com/auth/spreadsheets',
    ];
    //'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/drive'

    // Generate the url that will be used for the consent dialog.
    static getAuthUrl(oauth2Client: OAuth2Client) {
        if (!oauth2Client) oauth2Client = oauth2Client;

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
            prompt: 'consent',
        });
    }

    static calculateTimeToExpiry(expiryDate: number | undefined | null) {
        if (!expiryDate) return -1;
        return expiryDate - new Date().getTime();
    }

    static async loginHandler(req: Request, res: Response) {
        try {
            const token = req.body.id_token;

            if (!token) throw new Error('No token provided');
            const ticket = await oAuthClient.verifyIdToken({
                idToken: token,
                audience: [
                    keys.installed.client_id,
                    '386403657277-9mh2cnqb9dneoh8lc6o2m339eemj24he.apps.googleusercontent.com',
                    '386403657277-21tus25hgaoe7jdje73plc2qbgakht05.apps.googleusercontent.com',
                ],
            });

            const payload = ticket.getPayload();
            if (!payload) throw new Error('No payload provided');
            if (!payload.email)
                throw new Error(`Twoje konto Google nie ma przypisanego adresu email. 
                Zaloguj się na konto Google i przypisz adres email.`);
            if (!payload.name)
                throw new Error(
                    `Twoje konto Google nie ma przypisanego imienia i nazwiska.`
                );
            if (!payload.picture)
                payload.picture = 'https://www.gravatar.com/avatar/?d=mp';

            const systemRole = await this.determineSystemRole(payload.email);
            if (!systemRole)
                throw new Error(
                    'Nie masz dostępu do systemu. Skontaktuj się z administratorem.'
                );
            req.session.userData = {
                enviId: systemRole.personId,
                googleId: payload.sub,
                systemEmail: payload.email,
                userName: payload.name,
                picture: payload.picture,
                systemRoleName: systemRole.name,
                systemRoleId: systemRole.id,
            };
            console.log('User data set in session:', req.session.userData);
            //jeśli nie ma googleId w bazie danych, to go wpisuje (po pierwszym zalogowaniu)
            if (!systemRole.googleId) {
                await ToolsGapi.editUserGoogleIdInDb(
                    systemRole.personId,
                    req.session.userData.googleId
                );
                console.log('GoogleId added to database');
            }
        } catch (error) {
            throw error;
        }
    }

    static async determineSystemRole(email: string) {
        const person = new Person({ systemEmail: email });
        const role = await person.getSystemRole();
        return role;
    }

    static async getNewCredentials(refreshToken: string) {
        try {
            // Ustawienie refresh tokena w OAuth2Client
            oAuthClient.setCredentials({
                refresh_token: refreshToken,
            });

            // Uzyskanie nowego access_tokena
            const tokens = await oAuthClient.getAccessToken();

            // Sprawdzenie, czy token został poprawnie uzyskany
            if (!tokens.token) {
                throw new Error('Failed to obtain access token');
            }

            // Uzyskanie pełnych credentials z tokenami
            const newCredentials = oAuthClient.credentials;

            console.log('New credentials:', newCredentials);

            return newCredentials;
        } catch (error) {
            console.error('Error obtaining new credentials:', error);
            throw error;
        }
    }

    static async gapiReguestHandler(
        req: Request,
        res: Response,
        gapiFunction: Function,
        argObject?: any,
        thisObject?: any
    ) {
        let result;
        console.log('--------------- authenticate ----------------');
        let credentials: any = req.session.credentials;
        let refreshToken: string;
        //zmieniły się zakresy
        if (
            credentials &&
            !Envi.ToolsArray.equalsIgnoreOrder(
                credentials.scope.split(' '),
                ToolsGapi.scopes
            )
        ) {
            let authorizeUrl = ToolsGapi.getAuthUrl(oAuthClient);
            return { authorizeUrl: authorizeUrl };
        }
        //pierwsze logowanie zarejestrowanego użytkownika
        if (
            !req.session.credentials ||
            ToolsGapi.calculateTimeToExpiry(credentials.expiry_date) < 2
        ) {
            if (!process.env.REFRESH_TOKEN)
                throw new Error("Can't get refresh token");
            refreshToken = process.env.REFRESH_TOKEN;

            //pierwsze logowanie nowego użytkownika
            if (!refreshToken) {
                let authorizeUrl = ToolsGapi.getAuthUrl(oAuthClient);
                return { authorizeUrl: authorizeUrl };
            } else {
                credentials = { refresh_token: refreshToken };
                console.log('credentials:', credentials);
            }
        }

        console.log(
            'credentials valid for: %d s',
            ToolsGapi.calculateTimeToExpiry(credentials.expiry_date) / 1000
        );
        oAuthClient.setCredentials(credentials);

        const args: any[] = [oAuthClient];
        if (
            typeof argObject === 'object' &&
            argObject !== null &&
            argObject !== undefined
        )
            args.push(...argObject);
        else args.push(argObject);

        result = thisObject
            ? await gapiFunction.apply(thisObject, args)
            : await gapiFunction(...args);
        return result;
    }

    private static async editUserDataInDb(data: {
        id: number;
        googleId?: string;
        googleRefreshToken?: string;
    }) {
        return await ToolsDb.editInDb('Persons', data);
    }
    static async editUserGoogleIdInDb(userId: number, googleId: string) {
        return await this.editUserDataInDb({ id: userId, googleId: googleId });
    }
    static async editUserGoogleRefreshTokenInDb(
        userId: number,
        googleRefreshToken: string
    ) {
        return await this.editUserDataInDb({
            id: userId,
            googleRefreshToken: googleRefreshToken,
        });
    }
}
