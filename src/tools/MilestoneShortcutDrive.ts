import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const requestOptions = { timeout: 30000, retry: false };

// Dedicated transport: never searches for/adopts a manual shortcut by name or target.
export default class MilestoneShortcutDrive {
    static async reserve(auth: OAuth2Client): Promise<string> {
        const response = await google.drive({ version: 'v3', auth }).files.generateIds({
            count: 1, space: 'drive', type: 'shortcuts',
        }, requestOptions);
        const id = response.data.ids?.[0];
        if (!id) throw new Error('SHORTCUT_ID_UNAVAILABLE');
        return id;
    }

    static async get(auth: OAuth2Client, id: string) {
        const response = await google.drive({ version: 'v3', auth }).files.get({
            fileId: id, supportsAllDrives: true,
            fields: 'id,mimeType,parents,trashed,shortcutDetails,appProperties,capabilities(canAddChildren,canTrash)',
        }, requestOptions);
        return response.data;
    }

    static async trash(auth: OAuth2Client, id: string) {
        await google.drive({ version: 'v3', auth }).files.update({
            fileId: id, supportsAllDrives: true, fields: 'id', requestBody: { trashed: true },
        }, requestOptions);
    }

    static async create(auth: OAuth2Client, id: string, target: string, parent: string, name: string, owner: string) {
        await google.drive({ version: 'v3', auth }).files.create({
            supportsAllDrives: true, fields: 'id',
            requestBody: { id, name, mimeType: 'application/vnd.google-apps.shortcut', parents: [parent],
                shortcutDetails: { targetId: target }, appProperties: { psMilestoneLink: owner } },
        }, requestOptions);
    }
}
