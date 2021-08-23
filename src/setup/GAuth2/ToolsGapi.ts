import { OAuth2Client } from 'google-auth-library';
import url from 'url';
import Person from '../../persons/Person';
import { Envi } from '../../tools/Tools';
import ToolsDb from '../../tools/ToolsDb';

// Download your OAuth2 configuration from the Google
export const keys = {
    "installed": {
        "client_id": "246174537725-7t658k3s4u5fsi35jjs4si7ukqlnaujb.apps.googleusercontent.com",
        "project_id": "erp-envi-1611690452900",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "redirect_uris": [
            "http://localhost:3000/oauthcallback/",
            "http://localhost/envi.projectsite/"
        ],
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_secret": "a-4Yh4X8lv4t3Yw7xjKjILsL",
        "javascript_origins": [
            "http://localhost",
            "https://oramm.github.io",
            "https://sites.google.com",
            "https://ps.envi.com.pl",
            "http://ps.envi.com.pl",
            "http://erp.envi.com.pl",
            "https://erp.envi.com.pl"
        ]
    }
};


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

    static async getGoogleUserPayload(idToken?: string) {
        if (oAuthClient.credentials.id_token && !idToken)
            idToken = oAuthClient.credentials.id_token;
        if (idToken) {
            const ticket = await oAuthClient.verifyIdToken({
                idToken: idToken,
                audience: keys.installed.client_id, // Specify the CLIENT_ID of the app that accesses the backend
            });
            const payload = ticket.getPayload();
            console.log('setGoogleUserId payload: %o', payload);
            return payload
        }
    }

    static async gapiReguestHandler(req: any, res: any, gapiFunction: Function, argObject?: any, thisObject?: any) {
        let result;
        console.log('--------------- authenticate ----------------')
        console.log(`user: ${JSON.stringify(req.session.userData)}:: ${req.session.id}`);
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

        //console.log('\n\n init credentials: %s', credentials);
        console.log('credentials valid for: %d s', ToolsGapi.calculateTimeToExpiry(credentials.expiry_date) / 1000);
        oAuthClient.setCredentials(credentials);

        //console.log('credentials: %o', oAuthClient.credentials);
        try {
            result = (thisObject) ? await gapiFunction.apply(thisObject, [oAuthClient, argObject]) : await gapiFunction(oAuthClient, argObject);
            if (result) {
                req.session.userData = await this.getGoogleUserPayload();
                req.session.credentials = oAuthClient.credentials;
            }
            return result;
        } catch (error) {
            console.log('zły token error');
            console.log(error.message);
            throw error;

            //await open(authorizeUrl, { wait: false }).then((cp: any) => cp.unref());
        };
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