import { drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import { Envi } from './EnviTypes';
import { Readable } from 'stream';

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
            return (
                'https://docs.google.com/document/d/' + gdDocumentId + '/edit'
            );
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
        } else console.log('No files found.');
    }

    static async getFileOrFolderById(auth: OAuth2Client, id: string) {
        const drive = google.drive({ version: 'v3', auth });
        const fileSchema = await drive.files.get({ fileId: id });
        return await fileSchema.data;
    }

    /**
     * Zwraca folder po jego nazwie.
     * Do sprawdzenia czy plik istnieje użyj this.fileOrFolderExists()
     * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
     */
    static async getFileByName(
        auth: OAuth2Client,
        parameters: { parentId: string; fileName: string; isTrashed?: boolean }
    ) {
        if (!parameters.isTrashed) parameters.isTrashed = false;
        const drive = google.drive({ version: 'v3', auth });
        const q = `name = '${parameters.fileName}' and '${parameters.parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = ${parameters.isTrashed}`;
        const filesSchema = await drive.files.list({
            q,
            //pageSize: 10,
            //fields: 'nextPageToken, files(id, name, parents, mimeType)',
        });
        if (filesSchema.data.files && filesSchema.data.files.length) {
            //console.log('Files:');
            filesSchema.data.files.map((file: drive_v3.Schema$File) => {
                //console.log(`${file.name} (${file.id})`);
            });
            return filesSchema.data.files[0];
        } //else { console.log('No files found.'); }
    }
    /**
     * Sprawdza czy plik lub folder istnieje
     */
    static async fileOrFolderExists(
        auth: OAuth2Client,
        fileOrFolderId: string
    ) {
        try {
            const fileSchema = await this.getFileOrFolderById(
                auth,
                fileOrFolderId
            );
            return true;
        } catch (err) {
            return false;
        }
    }

    static async uploadFileMulter(
        auth: OAuth2Client,
        file: Express.Multer.File, // zaktualizuj typ danych
        options: drive_v3.Params$Resource$Files$Create = {},
        parentFolderId: string
    ) {
        if (typeof file !== 'object')
            throw new Error(
                `'file is type of ${typeof file} but should be object`
            );
        const drive = google.drive({ version: 'v3', auth });
        let { originalname: name, mimetype: mimeType } = file; // użyj odpowiednich pól z Express.Multer.File
        const { fields = 'id', ...otherOptions } = options;

        const parent = parentFolderId;
        const media = {
            mimeType,
            body: Readable.from(file.buffer), // użyj bezpośrednio buffer z Express.Multer.File
        };

        try {
            const res = await drive.files.create({
                requestBody: {
                    name: name,
                    parents: parent ? [parent] : [],
                },
                media,
                fields,
                ...otherOptions,
            });
            return res.data;
        } catch (err) {
            console.error(`Failed to upload file ${name}`, err);
            throw err;
        }
    }

    /**wgrywa plik na serwer
     * @param auth
     * @param file - blob64 do wgrania
     * @param options - paramentry pliku wg api
     * @param parentFolderId - opcjonalny jeśłi nie podany parent jest brany z bloba - file
     * @deprecated - do zastąpienia
     */
    static async uploadFileBase64(
        auth: OAuth2Client,
        file: Envi._blobEnviObject,
        options: drive_v3.Params$Resource$Files$Create = {},
        parentFolderId?: string
    ) {
        const drive = google.drive({ version: 'v3', auth });
        let { name, mimeType, parent } = file;
        const { fields = 'id', ...otherOptions } = options;

        if (parentFolderId) parent = parentFolderId;
        const media = {
            mimeType,
            body: Readable.from(Buffer.from(file.blobBase64String, 'base64')),
        };
        let x: drive_v3.Params$Resource$Files$Create = { media };
        try {
            const res = await drive.files.create({
                requestBody: {
                    name: name,
                    parents: parent ? [parent] : [],
                },
                media,
                fields,
                ...otherOptions,
            });
            return res.data;
        } catch (err) {
            console.error(`Failed to upload file ${name}`, err);
            throw err;
        }
    }

    static async createFolder(
        auth: OAuth2Client,
        folderData: { name: string; parents: string[] }
    ) {
        const drive = google.drive({ version: 'v3', auth });
        const fileMetadata = {
            name: folderData.name,
            parents: folderData.parents,
            mimeType: 'application/vnd.google-apps.folder',
        };
        const filesSchema = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id',
        });
        //console.log('New Gd folder Id: ', filesSchema.data.id);
        return filesSchema.data;
    }

    /** Zwraca istniejący folder lub tworzy nowy
     */
    static async setFolder(
        auth: OAuth2Client,
        parameters: { parentId: string; name: string; id?: string }
    ) {
        parameters.name = parameters.name.trim();

        let folder: drive_v3.Schema$File | undefined = await this.getFileByName(
            auth,
            { fileName: parameters.name, parentId: parameters.parentId }
        );
        if (!folder) {
            folder = (await this.createFolder(auth, {
                name: parameters.name,
                parents: [parameters.parentId],
            })) as drive_v3.Schema$File;
            await this.createPermissions(auth, { fileId: folder.id as string });
        }
        if (typeof folder.id != 'string')
            throw new Error('Nie utworzono folderu');
        return folder;
    }

    static async updateFile(
        auth: OAuth2Client,
        requestBody: drive_v3.Schema$File
    ) {
        try {
            if (!requestBody.id)
                throw new Error(
                    'ToolsGd.updateFile:: no fileId given in requestBody'
                );
            const drive = google.drive({ version: 'v3', auth });
            const fileId = <string>requestBody.id;
            delete requestBody.id;
            const filesSchema = await drive.files.update({
                fileId: fileId,
                requestBody: requestBody,
            });
            console.log(`Zaktualizowano plik ${fileId}`);
            return filesSchema.data;
        } catch (error) {
            throw error;
        }
    }

    static async updateFolder(
        auth: OAuth2Client,
        requestBody: drive_v3.Schema$File
    ) {
        try {
            const filesSchemaData = await this.updateFile(auth, requestBody);
            console.log(`Zaktualizowano folder ${requestBody.id}`);
            return filesSchemaData;
        } catch (error) {
            throw error;
        }
    }

    static async moveFileOrFolder(
        auth: OAuth2Client,
        fileData: drive_v3.Schema$File,
        newParentFolderId: string
    ) {
        try {
            const drive = google.drive({ version: 'v3', auth });
            const fileId = <string>fileData.id;

            console.log(`Przenoszę do nowego folderu plik ${fileId} ...`);

            await drive.files.update({
                fileId: fileId,
                removeParents: fileData.parents?.join(','),
                addParents: newParentFolderId,
            });
            console.log(`Plik przeniesiony do ${newParentFolderId}`);
            return 'ok';
        } catch (error) {
            throw error;
        }
    }

    static async trashFile(auth: OAuth2Client, fileId: string) {
        try {
            await this.updateFile(auth, { id: fileId, trashed: true });
            console.log(`Plik przeniesiono do kosza na GD: ${fileId}`);
            return 'ok';
        } catch (error) {
            throw error;
        }
    }

    static async trashFolder(auth: OAuth2Client, fileId: string) {
        try {
            await this.trashFile(auth, fileId);
            console.log(`Folder przeniesiono ko kosza na GD: ${fileId}`);
            return 'ok';
        } catch (error) {
            throw error;
        }
    }

    static async deleteFile(auth: OAuth2Client, fileId: string) {
        try {
            const drive = google.drive({ version: 'v3', auth });
            await drive.files.delete({
                fileId: fileId,
            });
            console.log(`z Dysku Google usunięto plik ${fileId}`);
            return 'ok';
        } catch (error) {
            throw error;
        }
    }

    static async copyFile(
        auth: OAuth2Client,
        originFileId: string,
        destFolderId: string,
        copyName: string
    ) {
        try {
            const drive = google.drive({ version: 'v3', auth });
            const newFile = await drive.files.copy({
                fileId: originFileId,
                requestBody: {
                    name: copyName,
                    parents: [destFolderId],
                },
            });
            console.log(`Skopiowano plik ${originFileId}`);
            return newFile;
        } catch (error) {
            throw error;
        }
    }

    /** przenosi do kosza albo zmmienia nazwę dodając oznacznienie 'USUŃ' jeśli nie ma uprawnień */
    static async trashFileOrFolder(auth: OAuth2Client, gdFolderId: string) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.get({
            fileId: gdFolderId,
            fields: 'id, ownedByMe',
        });
        console.log(filesSchema.data);
        if (filesSchema.data.ownedByMe)
            await ToolsGd.trashFile(auth, filesSchema.data.id as string);
        else
            await ToolsGd.updateFolder(auth, {
                id: gdFolderId,
                name: `${filesSchema.data.name} - USUŃ`,
            });
    }

    /** domyślnie ustawia uprawnienia { type: 'anyone', role: 'writer' }
     * https://developers.google.com/drive/api/v3/manage-sharing#create_a_permission
     */
    static async createPermissions(
        auth: OAuth2Client,
        parameters: {
            fileId: string;
            permissions?: [
                { type: string; role: string; emailAddress?: string }
            ];
        }
    ) {
        if (!parameters.permissions)
            parameters.permissions = [{ type: 'anyone', role: 'writer' }];
        const drive = google.drive({ version: 'v3', auth });
        for (const permission of parameters.permissions) {
            let permissionSchema = await drive.permissions.create({
                requestBody: permission,
                fileId: parameters.fileId,
                fields: 'id',
            });
            //console.log('Permission createed: %o', permissionSchema.data);
            return permissionSchema.data;
        }
    }
}
