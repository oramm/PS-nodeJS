import { drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import { Envi } from './EnviTypes';

export default class ToolsGd {
    static createGdFolderUrl(gdFolderId: string): string {
        return 'https://drive.google.com/drive/folders/' + gdFolderId;
    }

    static createDocumentOpenUrl(gdDocumentId: string): string | undefined {
        if (gdDocumentId)
            return 'https://drive.google.com/open?id=' + gdDocumentId;
    }

    static createDocumentEditUrl(gdDocumentId: string): string | undefined {
        if (gdDocumentId)
            return 'https://docs.google.com/document/d/' + gdDocumentId + '/edit';
    }

    /**
     * Lists the names and IDs of up to 10 files.
     * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
     */
    static async listFiles(auth: OAuth2Client) {

        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.list({
            pageSize: 10,
            fields: 'nextPageToken, files(id, name)',
        });
        if (filesSchema.data.files && filesSchema.data.files.length) {
            console.log('Files:');
            filesSchema.data.files.map((file: drive_v3.Schema$File) => {
                console.log(`${file.id}: ${file.name}`);
            });
        } else
            console.log('No files found.');
    }

    static async getFileOrFolderById(auth: OAuth2Client, id: string) {
        const drive = google.drive({ version: 'v3', auth });
        return await (await drive.files.get({ fileId: id })).data;

    }

    /**
     * Zwraca folder po jego nazwie.
     * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
     */
    static async getFileByName(auth: OAuth2Client, parameters: { parentId: string, fileName: string, isTrashed?: boolean }) {
        if (!parameters.isTrashed) parameters.isTrashed = false;
        const drive = google.drive({ version: 'v3', auth });
        const q = `name = '${parameters.fileName}' and '${parameters.parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = ${parameters.isTrashed}`;
        const filesSchema = await drive.files.list({
            q,
            //pageSize: 10,
            //fields: 'nextPageToken, files(id, name, parents, mimeType)',

        });
        if (filesSchema.data.files && filesSchema.data.files.length) {
            console.log('Files:');
            filesSchema.data.files.map((file: drive_v3.Schema$File) => {
                console.log(`${file.name} (${file.id})`);
            });
            return filesSchema.data.files[0];
        } else
            console.log('No files found.');
    }

    //https://stackoverflow.com/questions/13230487/converting-a-buffer-into-a-readablestream-in-node-js/44091532#44091532
    static async uploadFile(auth: OAuth2Client, files: [Envi._blobEnviObject]) {
        const drive = google.drive({ version: 'v3', auth });
        for (const file of files) {
            const filePath = `tmp/${file.name}`;
            const fileMetadata = {
                'name': file.name,
                parents: file.parents
            };
            const buff = Buffer.from(file.blobBase64String, 'base64');
            fs.writeFileSync(filePath, buff);
            const content: fs.ReadStream = fs.createReadStream(filePath);
            //console.log(content);
            const media = {
                mimeType: file.mimeType,
                body: content
            };

            let filesSchema = await drive.files.create({
                //@ts-ignore
                resource: fileMetadata,
                media: media,
                fields: 'id'
            })
            console.log(`Usuwam: ${filePath}`)
            fs.unlinkSync(filePath)
            console.log('New Gd File Id: ', filesSchema.data.id);
            return filesSchema.data;
        }
    }

    static async createFolders(auth: OAuth2Client, folderData: [{ name: string, parents: [string] }]) {
        const drive = google.drive({ version: 'v3', auth });
        for (const folder of folderData) {
            let fileMetadata = {
                'name': folder.name,
                parents: folder.parents,
                'mimeType': 'application/vnd.google-apps.folder'

            };
            let filesSchema = await drive.files.create({
                //@ts-ignore
                resource: fileMetadata,
                fields: 'id'
            })
            console.log('New Gd folder Id: ', filesSchema.data.id);
            return filesSchema.data;
        }
    }
    /**
     * Zwraca isteniejący folder lub tworzy nowy 
     */
    static async setFolder(auth: OAuth2Client, parameters: { parentId: string, name: string, id?: string }) {
        parameters.name = parameters.name.trim();

        let folder: drive_v3.Schema$File | undefined = await this.getFileByName(auth, { fileName: parameters.name, parentId: parameters.parentId });
        if (!folder) {
            folder = await (this.createFolders(auth, [{ name: parameters.name, parents: [parameters.parentId] }]) as drive_v3.Schema$File);
            await this.createPermissions(auth, { fileId: folder.id as string });
        }
        return folder;
    }

    static async updateFile(auth: OAuth2Client, requestBody: drive_v3.Schema$File) {
        try {
            const drive = google.drive({ version: 'v3', auth });
            const fileId = requestBody.id;
            delete requestBody.id;
            const filesSchema = await drive.files.update({
                fileId,
                requestBody
            })
            console.log(`Zaktualizowano plik ${fileId}`);
            return filesSchema.data;
        } catch (error) {
            throw error;
        }
    }

    static async updateFolder(auth: OAuth2Client, requestBody: drive_v3.Schema$File) {
        try {
            const filesSchemaData = await this.updateFile(auth, requestBody);
            console.log(`Zaktualizowano folder ${requestBody.id}`);
            return filesSchemaData;
        } catch (error) {
            throw error;
        }
    }

    static async trashFile(auth: OAuth2Client, fileId: string) {
        try {
            console.log(`Przenoszę do kosza na Gd plik ${fileId} ...`);
            await this.updateFile(auth, { id: fileId, trashed: true })
            console.log(`z Dysku Google usunięto plik ${fileId}`);
            return "ok";
        } catch (error) {
            throw error;
        }
    }

    static async trashFolder(auth: OAuth2Client, fileId: string) {
        try {
            await this.trashFile(auth, fileId);
            console.log(`z Dysku Google usunięto folder ${fileId}`);
            return "ok";
        } catch (error) {
            throw error;
        }
    }

    static async deleteFile(auth: OAuth2Client, fileId: string) {
        try {
            console.log(`z Dysku Google usuwam plik ${fileId} ...`);

            const drive = google.drive({ version: 'v3', auth });
            await drive.files.delete({
                fileId: fileId
            })
            console.log(`z Dysku Google usunięto plik ${fileId}`);
            return "ok";
        } catch (error) {
            throw error;
        }
    }

    /*
     * https://developers.google.com/drive/api/v3/manage-sharing#create_a_permission
     */
    static async createPermissions(auth: OAuth2Client, parameters: { fileId: string, permissions?: [{ type: string, role: string, emailAddress?: string }] }) {
        if (!parameters.permissions) parameters.permissions = [{ type: 'anyone', role: 'writer' }]
        const drive = google.drive({ version: 'v3', auth });
        for (const permission of parameters.permissions) {
            let permissionSchema = await drive.permissions.create({
                //@ts-ignore
                resource: permission,
                fileId: parameters.fileId,
                fields: 'id'
            })
            console.log('Permission createed: %o', permissionSchema.data);
            return permissionSchema.data;
        }
    }
}