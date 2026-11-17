import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const options = { timeout: 30000, retry: false };
export default class ConsolidationPreparationDrive {
    static async reserve(auth: OAuth2Client) {
        const result = await google.drive({ version: 'v3', auth }).files.generateIds({ count: 1, space: 'drive', type: 'files' }, options);
        const id = result.data.ids?.[0];
        if (!id) throw new Error('DRIVE_STATE_UNCERTAIN');
        return id;
    }
    static async get(auth: OAuth2Client, id: string) {
        return (await google.drive({ version: 'v3', auth }).files.get({ fileId: id, supportsAllDrives: true,
            fields: 'id,name,mimeType,parents,trashed,appProperties,capabilities(canAddChildren)' }, options)).data;
    }
    static async create(auth: OAuth2Client, id: string, parent: string, name: string, owner: string) {
        await google.drive({ version: 'v3', auth }).files.create({ supportsAllDrives: true, fields: 'id',
            requestBody: { id, name, parents: [parent], mimeType: 'application/vnd.google-apps.folder',
                appProperties: { psConsolidationPreparation: owner } } }, options);
    }
}
