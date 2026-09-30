import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import { SB_DRIVE_ID, SB_DRIVE_ROLE } from './sbAccessPolicy';

/**
 * Uprawnienia na dysku współdzielonym SB.ENVI. Tylko transport, bez decyzji biznesowych.
 * Konto: serwerowy REFRESH_TOKEN (organizator SB.ENVI), bez zalogowanego użytkownika.
 */

export interface SbDrivePermission {
    id: string;
    emailAddress: string | null;
    role: string;
}

/**
 * Autoryzacja jak w `BaseController.withAuth`: setCredentials tylko przy innym tokenie,
 * bo bezwarunkowe kasuje ważny access token współdzielonego klienta.
 */
async function getServerAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken)
        throw new Error('Brak serwerowego dostępu do Google (REFRESH_TOKEN)');
    if (oAuthClient.credentials?.refresh_token !== refreshToken)
        oAuthClient.setCredentials({ refresh_token: refreshToken });
    const tokens = await oAuthClient.getAccessToken();
    if (!tokens.token) throw new Error('Nie udało się pobrać tokenu dostępu Google');
    return oAuthClient;
}

function httpStatusOf(error: unknown): number | undefined {
    const e = error as any;
    const status = e?.code ?? e?.status ?? e?.response?.status;
    return typeof status === 'number' ? status : Number(status) || undefined;
}

async function drive() {
    return google.drive({ version: 'v3', auth: await getServerAuth() });
}

export default class SbDriveGateway {
    /** Jedno uprawnienie; null = nie istnieje (404). */
    static async getPermission(
        permissionId: string,
    ): Promise<SbDrivePermission | null> {
        try {
            const { data } = await (await drive()).permissions.get({
                fileId: SB_DRIVE_ID,
                permissionId,
                supportsAllDrives: true,
                fields: 'id,emailAddress,role',
            });
            return {
                id: String(data.id),
                emailAddress: data.emailAddress ?? null,
                role: String(data.role),
            };
        } catch (error) {
            if (httpStatusOf(error) === 404) return null;
            throw error;
        }
    }

    /** Uprawnienie danego adresu (porównanie bez wielkości liter); null = brak. */
    static async findPermissionByEmail(
        email: string,
    ): Promise<SbDrivePermission | null> {
        const client = await drive();
        const wanted = email.trim().toLowerCase();
        let pageToken: string | undefined;
        do {
            const { data } = await client.permissions.list({
                fileId: SB_DRIVE_ID,
                supportsAllDrives: true,
                pageSize: 100,
                pageToken,
                fields: 'nextPageToken,permissions(id,emailAddress,role)',
            });
            const match = (data.permissions ?? []).find(
                (p) => (p.emailAddress ?? '').toLowerCase() === wanted,
            );
            if (match)
                return {
                    id: String(match.id),
                    emailAddress: match.emailAddress ?? null,
                    role: String(match.role),
                };
            pageToken = data.nextPageToken ?? undefined;
        } while (pageToken);
        return null;
    }

    /** Nadaje czytelnika; zwraca identyfikator uprawnienia. Google wysyła osobie powiadomienie. */
    static async grantReader(email: string): Promise<string> {
        const { data } = await (await drive()).permissions.create({
            fileId: SB_DRIVE_ID,
            supportsAllDrives: true,
            sendNotificationEmail: true,
            fields: 'id',
            requestBody: { type: 'user', role: SB_DRIVE_ROLE, emailAddress: email },
        });
        if (!data.id) throw new Error('Dysk nie zwrócił identyfikatora uprawnienia');
        return String(data.id);
    }

    /** Usuwa uprawnienie. false = już go nie było (404). */
    static async deletePermission(permissionId: string): Promise<boolean> {
        try {
            await (await drive()).permissions.delete({
                fileId: SB_DRIVE_ID,
                permissionId,
                supportsAllDrives: true,
            });
            return true;
        } catch (error) {
            if (httpStatusOf(error) === 404) return false;
            throw error;
        }
    }
}
