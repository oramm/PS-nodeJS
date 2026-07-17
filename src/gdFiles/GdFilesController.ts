import { OAuth2Client } from 'google-auth-library';
import BaseController from '../controllers/BaseController';
import ToolsGd from '../tools/ToolsGd';
import Setup from '../setup/Setup';

export type CreatedGdFile = {
    id: string;
    name: string;
    webViewLink: string;
};

const NATIVE_MIME_TYPES = {
    document: 'application/vnd.google-apps.document',
    spreadsheet: 'application/vnd.google-apps.spreadsheet',
} as const;

export type GoogleDocumentType = keyof typeof NATIVE_MIME_TYPES;

/**
 * Operacje na plikach w folderach Google Drive dla widoku TasksGlobal.
 * Wszystko wykonywane na wspólnym koncie master (REFRESH_TOKEN) przez withAuth.
 * Brak własnego repozytorium - kontroler operuje wyłącznie na Google Drive.
 */
export default class GdFilesController extends BaseController<any, any> {
    private static instance: GdFilesController;

    private constructor() {
        super(null as any);
    }

    private static getInstance(): GdFilesController {
        if (!this.instance) this.instance = new GdFilesController();
        return this.instance;
    }

    /** Wgrywa przesłane pliki (multer) do wskazanego folderu GD. */
    static async uploadFilesToFolder(
        files: Express.Multer.File[],
        gdFolderId: string,
        auth?: OAuth2Client
    ): Promise<CreatedGdFile[]> {
        if (!gdFolderId) throw new Error('Nie podano gdFolderId');
        if (!files || files.length === 0)
            throw new Error('Nie przesłano żadnego pliku');

        return await this.withAuth(async (_instance, authClient) => {
            const created: CreatedGdFile[] = [];
            for (const file of files) {
                const uploaded = (await ToolsGd.uploadFileMulter(
                    authClient,
                    file,
                    { fields: 'id,name,webViewLink' },
                    gdFolderId
                )) as CreatedGdFile;
                await ToolsGd.createPermissions(authClient, {
                    fileId: uploaded.id,
                });
                created.push(uploaded);
            }
            return created;
        }, auth);
    }

    /** Tworzy pusty dokument Google Docs lub arkusz Google Sheets w folderze GD. */
    static async createGoogleDocument(
        params: { gdFolderId: string; name: string; type: GoogleDocumentType },
        auth?: OAuth2Client
    ): Promise<CreatedGdFile> {
        const { gdFolderId, name, type } = params;
        if (!gdFolderId) throw new Error('Nie podano gdFolderId');
        if (!name || !name.trim()) throw new Error('Nie podano nazwy dokumentu');
        const mimeType = NATIVE_MIME_TYPES[type];
        if (!mimeType)
            throw new Error(
                `Nieobsługiwany typ dokumentu: ${type}. Dozwolone: document, spreadsheet`
            );

        return await this.withAuth(async (_instance, authClient) => {
            const templateId = Setup.Gd.blankDocTemplateId;
            let file: CreatedGdFile;

            // Docs API nie umie przełączyć trybu pageless→strony, więc dla dokumentu
            // kopiujemy pusty szablon w trybie stronicowym (jeśli skonfigurowany).
            if (type === 'document' && templateId) {
                const copied = await ToolsGd.copyFile(
                    authClient,
                    templateId,
                    gdFolderId,
                    name.trim()
                );
                const id = copied.data.id as string;
                file = {
                    id,
                    name: copied.data.name ?? name.trim(),
                    webViewLink: ToolsGd.createDocumentEditUrl(id) as string,
                };
            } else {
                file = (await ToolsGd.createNativeFile(authClient, {
                    name: name.trim(),
                    parentId: gdFolderId,
                    mimeType,
                })) as CreatedGdFile;
            }

            await ToolsGd.createPermissions(authClient, { fileId: file.id });
            return file;
        }, auth);
    }
}
