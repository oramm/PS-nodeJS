import { drive_v3, google } from 'googleapis';
import { Readable } from 'stream';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import { DriveFileInfo, SigningDrive } from './SigningDrive';

const FILE_FIELDS = 'id, name, mimeType, size, parents, trashed';

function toInfo(file: drive_v3.Schema$File): DriveFileInfo {
    return {
        id: file.id as string,
        name: file.name ?? '',
        mimeType: file.mimeType ?? '',
        size: file.size != null ? Number(file.size) : undefined,
        parents: file.parents ?? undefined,
        trashed: file.trashed ?? undefined,
    };
}

/**
 * Dysk Google dla zlecen podpisu. Autoryzacja jak w eksporcie pism (ToolsGapi: wspolny
 * REFRESH_TOKEN serwera) - trasy programu nie maja sesji, wiec nie ma tokenu uzytkownika.
 * Dostep do folderu pisma wynika z konta serwera, a to, czy dana osoba wolno podpisywac to pismo,
 * rozstrzyga zakres projektu sprawdzany na trasach sesyjnych.
 */
export default class GoogleSigningDrive implements SigningDrive {
    private async drive(): Promise<drive_v3.Drive> {
        const auth = await ToolsGapi.getBackgroundAuth();
        return google.drive({ version: 'v3', auth });
    }

    async getFile(fileId: string): Promise<DriveFileInfo | undefined> {
        const drive = await this.drive();
        try {
            const res = await drive.files.get({
                fileId,
                fields: FILE_FIELDS,
                supportsAllDrives: true,
            });
            return toInfo(res.data);
        } catch (error: any) {
            if (error?.code === 404 || error?.status === 404) return undefined;
            throw error;
        }
    }

    async listFolder(folderId: string): Promise<DriveFileInfo[]> {
        const drive = await this.drive();
        const escaped = folderId.replace(/'/g, "\\'");
        const files: DriveFileInfo[] = [];
        let pageToken: string | undefined;
        do {
            const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
                q: `'${escaped}' in parents and trashed = false`,
                fields: `nextPageToken, files(${FILE_FIELDS})`,
                pageSize: 200,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
            });
            for (const file of res.data.files ?? []) files.push(toInfo(file));
            pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
        return files;
    }

    async downloadFile(fileId: string): Promise<Buffer> {
        const drive = await this.drive();
        const res = await drive.files.get(
            { fileId, alt: 'media', supportsAllDrives: true },
            { responseType: 'arraybuffer' }
        );
        return Buffer.from(res.data as ArrayBuffer);
    }

    async exportToPdf(fileId: string): Promise<Buffer> {
        const drive = await this.drive();
        const res = await drive.files.export(
            { fileId, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
        );
        return Buffer.from(res.data as ArrayBuffer);
    }

    async uploadPdf(params: {
        name: string;
        parentFolderId: string;
        bytes: Buffer;
    }): Promise<{ id: string }> {
        const drive = await this.drive();
        const created = await drive.files.create({
            requestBody: {
                name: params.name,
                parents: [params.parentFolderId],
                mimeType: 'application/pdf',
            },
            media: {
                mimeType: 'application/pdf',
                body: Readable.from(params.bytes),
            },
            fields: 'id',
            supportsAllDrives: true,
        });
        if (!created.data.id)
            throw new Error('Dysk Google nie zwrócił identyfikatora pliku.');
        return { id: created.data.id };
    }

    async trashFile(fileId: string): Promise<void> {
        const drive = await this.drive();
        await drive.files.update({
            fileId,
            requestBody: { trashed: true },
            supportsAllDrives: true,
        });
    }
}
