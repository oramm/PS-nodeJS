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

/** Limit pojedynczego wywołania Dysku (gaxios `timeout`). */
const REQUEST_TIMEOUT_MS = 20000;

function httpStatusOf(error: unknown): number | undefined {
    const e = error as any;
    const status = e?.status ?? e?.response?.status ?? e?.code;
    return typeof status === 'number' ? status : Number(status) || undefined;
}

/**
 * 404 znaczy "tego uprawnienia już nie ma" TYLKO, gdy Google mówi wprost o uprawnieniu
 * ("Permission not found: <id>"). 404 całego dysku ("File not found" / "Shared drive not
 * found") przychodzi też przy złym tokenie albo po utracie roli organizatora - wtedy to jest
 * błąd, a zapamiętany numer uprawnienia musi zostać do powtórki.
 */
function isPermissionNotFound(error: unknown): boolean {
    if (httpStatusOf(error) !== 404) return false;
    const e = error as any;
    const messages: string[] = [
        e?.message,
        ...(Array.isArray(e?.errors) ? e.errors.map((x: any) => x?.message) : []),
        e?.response?.data?.error?.message,
        ...(Array.isArray(e?.response?.data?.error?.errors)
            ? e.response.data.error.errors.map((x: any) => x?.message)
            : []),
    ].filter((m): m is string => typeof m === 'string');
    return messages.some((m) => /^Permission not found:?/i.test(m.trim()));
}

async function drive() {
    return google.drive({
        version: 'v3',
        auth: await getServerAuth(),
        timeout: REQUEST_TIMEOUT_MS,
    });
}

export default class SbDriveGateway {
    /** Jedno uprawnienie; null = nie istnieje ("Permission not found"). */
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
            if (isPermissionNotFound(error)) return null;
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

    /** Usuwa uprawnienie. false = już go nie było ("Permission not found"). */
    static async deletePermission(permissionId: string): Promise<boolean> {
        try {
            await (await drive()).permissions.delete({
                fileId: SB_DRIVE_ID,
                permissionId,
                supportsAllDrives: true,
            });
            return true;
        } catch (error) {
            if (isPermissionNotFound(error)) return false;
            throw error;
        }
    }
}
