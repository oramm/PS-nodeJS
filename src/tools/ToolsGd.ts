import { google } from 'googleapis';
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
            filesSchema.data.files.map((file: any) => {
                console.log(`${file.name} (${file.id})`);
            });
        } else
            console.log('No files found.');
    }

    //https://stackoverflow.com/questions/13230487/converting-a-buffer-into-a-readablestream-in-node-js/44091532#44091532
    static async uploadFile(auth: OAuth2Client, files: [Envi._blobEnviObject]) {
        const drive = google.drive({ version: 'v3', auth });
        for (const file of files) {
            let filePath = `tmp/${file.name}`;
            let fileMetadata = {
                'name': file.name,
                parents: file.parents
            };
            let buff = Buffer.from(file.blobBase64String, 'base64');
            fs.writeFileSync(filePath, buff);
            let content: fs.ReadStream = fs.createReadStream(filePath);
            //console.log(content);
            var media = {
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

    static async trashFile(auth: OAuth2Client, fileId: string) {
        try {
            console.log(`Przenoszé do kosza na Gd plik ${fileId} ...`);
            const drive = google.drive({ version: 'v3', auth });

            await drive.files.update({
                fileId,
                requestBody: { trashed: true }
            })
            console.log(`z Dysku Google usunięto plik ${fileId}`);
            return "ok";
        } catch (error) {
            throw error;
        }

    }
}