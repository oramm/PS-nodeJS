import { OAuth2Client } from 'google-auth-library';
import SystemRoleService from './SystemRoleService';
import ToolsDb from '../../tools/ToolsDb';
import { Request, Response } from 'express';
import { keys } from './credentials';
import { SystemRoleName } from '../../types/sessionTypes';
import PersonRepository from '../../persons/PersonRepository';

export const oAuthClient: OAuth2Client = new OAuth2Client(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0]
);

/**
 * Typ funkcji, która przyjmuje OAuth2Client jako pierwszy argument
 */
type GapiFunction<TArgs extends any[] = any[], TResult = any> = (
    auth: OAuth2Client,
    ...args: TArgs
) => Promise<TResult>;

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
            // ⚠️ DEV MODE: Check for mock authentication
            const { dev_mode, mock_user } = req.body;

            if (dev_mode === true) {
                // SECURITY: Only allow in development with explicit flag
                // SAFE: If ENABLE_DEV_LOGIN is undefined (not set), login will be blocked
                if (
                    process.env.NODE_ENV !== 'development' ||
                    process.env.ENABLE_DEV_LOGIN !== 'true'
                ) {
                    throw new Error(
                        'Dev mode login is not allowed in this environment'
                    );
                }

                console.warn(
                    '🔧 DEV MODE: Mock authentication - bypassing Google OAuth'
                );

                // Mock user data for Playwright/testing
                req.session.userData = {
                    enviId: 1,
                    googleId: 'mock-google-id-playwright',
                    systemEmail: 'playwright@test.local',
                    userName: mock_user || 'Playwright Test User',
                    picture: 'https://www.gravatar.com/avatar/?d=mp',
                    systemRoleName: SystemRoleName.ADMIN,
                    systemRoleId: 1,
                };

                console.log(
                    '🔧 DEV: Mock user data set in session:',
                    req.session.userData
                );
                return; // Exit early, skip Google OAuth
            }

            // NORMAL FLOW: Google OAuth verification
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
                if (!req.session.userData.googleId)
                    throw new Error('No user  googleId provided');
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
        return SystemRoleService.getSystemRole({ systemEmail: email });
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

    /**
     * @deprecated używać BaseController.withAuth
     * Wykonuje operacje na podstawie mojego Refresh tokena.
     *
     * @param gapiFunction - Funkcja Google API, która jako **pierwszy argument** przyjmuje OAuth2Client
     * @param argObject - Dodatkowe argumenty dla gapiFunction:
     *   - Jeśli array `[arg1, arg2]` → rozpakuje jako osobne argumenty
     *   - Jeśli pojedyncza wartość `{a: 1}` lub `'string'` → przekaże jako drugi argument
     *   - Jeśli undefined/null → wywołanie bez dodatkowych argumentów
     * @param thisObject - Kontekst (this) dla wywołania gapiFunction
     *
     * @throws {Error} Jeśli gapiFunction nie jest funkcją
     * @throws {Error} Jeśli refresh token nie istnieje
     * @throws {Error} Jeśli token Google OAuth jest nieprawidłowy
     *
     * @example
     * ```typescript
     * // ✅ Funkcja z wieloma argumentami
     * async function create(auth: OAuth2Client, title: string, folderId: string) { ... }
     * await ToolsGapi.gapiReguestHandler(req, res, create, ['My Title', 'folder123']);
     *
     * // ✅ Funkcja z pojedynczym obiektem
     * async function update(auth: OAuth2Client, options: {title: string, color: string}) { ... }
     * await ToolsGapi.gapiReguestHandler(req, res, update, {title: 'New', color: 'red'});
     *
     * // ✅ Funkcja bez dodatkowych argumentów
     * async function listFiles(auth: OAuth2Client) { ... }
     * await ToolsGapi.gapiReguestHandler(req, res, listFiles);
     *
     * // ❌ ŹLE - funkcja bez OAuth2Client
     * async function badFunction(documentId: string) { ... }
     * await ToolsGapi.gapiReguestHandler(req, res, badFunction, ['doc']); // TypeScript error!
     * ```
     */
    static async gapiReguestHandler<TArgs extends any[], TResult>(
        /**@deprecated  */
        req: any,
        /**@deprecated */
        res: Response,
        gapiFunction: GapiFunction<TArgs, TResult>,
        argObject?: any[] | any | undefined,
        thisObject?: any
    ): Promise<TResult> {
        console.log('--------------- authenticate ----------------');

        // Walidacja runtime
        if (typeof gapiFunction !== 'function') {
            throw new Error('gapiFunction must be a function');
        }

        const refreshToken = process.env.REFRESH_TOKEN;
        if (!refreshToken) throw new Error("Can't get refresh token");

        try {
            const credentials = { refresh_token: refreshToken };
            oAuthClient.setCredentials(credentials);

            // Buduj argumenty:
            // - Jeśli argObject jest array → spread elementów
            // - Jeśli argObject jest pojedynczą wartością → dodaj jako jeden argument
            // - Jeśli argObject jest undefined/null → brak dodatkowych argumentów
            let functionArgs: any[];
            if (argObject === undefined || argObject === null) {
                functionArgs = [oAuthClient];
            } else if (Array.isArray(argObject)) {
                functionArgs = [oAuthClient, ...argObject];
            } else {
                functionArgs = [oAuthClient, argObject];
            }

            const result = thisObject
                ? await gapiFunction.apply(
                      thisObject,
                      functionArgs as [OAuth2Client, ...TArgs]
                  )
                : await gapiFunction(
                      ...(functionArgs as [OAuth2Client, ...TArgs])
                  );

            return result;
        } catch (error) {
            if (
                error instanceof Error &&
                error.message?.includes('invalid_request')
            ) {
                throw new Error(
                    'Google OAuth token is invalid or expired. Please regenerate the refresh token.'
                );
            }
            throw error;
        }
    }

    private static async editUserDataInDb(data: {
        id: number;
        googleId?: string;
        googleRefreshToken?: string;
        microsoftId?: string;
        microsoftRefreshToken?: string;
    }) {
        const repository = new PersonRepository();
        const fieldsToSync = repository.getAccountWriteFields(Object.keys(data));
        if (fieldsToSync.length === 0) return;

        return await ToolsDb.transaction(async (conn) => {
            await repository.upsertPersonAccountInDb(
                {
                    id: data.id,
                    googleId: data.googleId,
                    googleRefreshToken: data.googleRefreshToken,
                    microsoftId: data.microsoftId,
                    microsoftRefreshToken: data.microsoftRefreshToken,
                },
                conn,
                fieldsToSync,
            );
        });
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
