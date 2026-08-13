import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../../setup/Sessions/ToolsGapi';

/**
 * Klient Google dla zapisow do arkuszy zaliczek.
 *
 * Modul nie dziedziczy po `BaseController`, bo ta klasa wymaga repozytorium, a tu
 * nie ma bazy danych - zrodlem prawdy sa arkusze. Ta funkcja robi dokladnie to samo,
 * co `BaseController.withAuth` w czesci autoryzacyjnej, i nic wiecej.
 */
export default async function getSheetsAuth(
    existingAuth?: OAuth2Client
): Promise<OAuth2Client> {
    if (existingAuth) return existingAuth;

    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken)
        throw new Error('Brak REFRESH_TOKEN - nie mozna sie polaczyc z Google Sheets');

    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const tokens = await oAuthClient.getAccessToken();
    if (!tokens.token)
        throw new Error('Nie udalo sie pobrac tokenu dostepu z Google');

    return oAuthClient;
}
