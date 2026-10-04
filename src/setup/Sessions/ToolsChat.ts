import { google, chat_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export type ChatMemberResult = {
    email: string;
    state: string; // JOINED | INVITED | FAILED
    error?: string;
};

export type ChatSpaceResult = {
    name: string;
    displayName: string;
    uri: string;
    members: ChatMemberResult[];
};

/**
 * Google Chat działa na koncie system@envi.com.pl (osobny OAuth od GOOGLE_*, które
 * jest kontem gmail i Chat go odrzuca). Poświadczenia: CHAT_CLIENT_ID,
 * CHAT_CLIENT_SECRET, CHAT_REFRESH_TOKEN.
 */
export default class ToolsChat {
    private static getChat(): chat_v1.Chat {
        const { CHAT_CLIENT_ID, CHAT_CLIENT_SECRET, CHAT_REFRESH_TOKEN } =
            process.env;
        if (!CHAT_CLIENT_ID || !CHAT_CLIENT_SECRET || !CHAT_REFRESH_TOKEN)
            throw new Error(
                'Brak CHAT_CLIENT_ID / CHAT_CLIENT_SECRET / CHAT_REFRESH_TOKEN w .env'
            );
        const auth = new OAuth2Client(CHAT_CLIENT_ID, CHAT_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: CHAT_REFRESH_TOKEN });
        return google.chat({ version: 'v1', auth });
    }

    /**
     * Zakłada pokój i dodaje członków. Błąd dodania jednego członka nie przerywa
     * całości: wraca jako state 'FAILED'. Gość z gmaila ma state 'INVITED'
     * (musi przyjąć zaproszenie) - to nie błąd. requestId daje idempotencję ponowień.
     */
    static async createSpaceWithMembers(
        displayName: string,
        emails: string[],
        requestId: string
    ): Promise<ChatSpaceResult> {
        const chat = this.getChat();
        const { data: space } = await chat.spaces.create({
            requestId,
            requestBody: {
                spaceType: 'SPACE',
                displayName: displayName.slice(0, 128),
                externalUserAllowed: true,
            },
        });
        const members: ChatMemberResult[] = [];
        for (const email of emails) {
            try {
                const { data } = await chat.spaces.members.create({
                    parent: space.name!,
                    requestBody: {
                        member: { name: `users/${email}`, type: 'HUMAN' },
                    },
                });
                members.push({ email, state: data.state || 'UNKNOWN' });
            } catch (e) {
                members.push({
                    email,
                    state: 'FAILED',
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        return {
            name: space.name!,
            displayName: space.displayName || displayName,
            uri: space.spaceUri || '',
            members,
        };
    }

    static async listSpaces(): Promise<chat_v1.Schema$Space[]> {
        const chat = this.getChat();
        const spaces: chat_v1.Schema$Space[] = [];
        let pageToken: string | undefined;
        do {
            const { data } = await chat.spaces.list({ pageSize: 100, pageToken });
            spaces.push(...(data.spaces || []));
            pageToken = data.nextPageToken || undefined;
        } while (pageToken);
        return spaces;
    }

    static async getSpace(name: string): Promise<chat_v1.Schema$Space> {
        const { data } = await this.getChat().spaces.get({ name });
        return data;
    }

    /** Głównie do testów. Po usunięciu GET zwraca 403, nieobecność sprawdzaj listą. */
    static async deleteSpace(name: string): Promise<void> {
        await this.getChat().spaces.delete({ name });
    }
}
