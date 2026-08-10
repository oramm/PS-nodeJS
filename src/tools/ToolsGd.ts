import { drive_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';

export default class ToolsGd {
    static createGdFolderUrl(gdFolderId: string): string {
        return 'https://drive.google.com/drive/folders/' + gdFolderId;
    }

    /**
     * Strumień bajtów pliku z GD wraz z jego mimeType i nazwą - do proxy'owania
     * podglądu (np. zdjęć wizyt) przez backend, bez upubliczniania plików na Drive.
     */
    static async getFileMedia(
        auth: OAuth2Client,
        fileId: string
    ): Promise<{ stream: Readable; mimeType?: string; name?: string }> {
        const drive = google.drive({ version: 'v3', auth });
        const meta = await drive.files.get({
            fileId,
            fields: 'mimeType,name',
        });
        const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        return {
            stream: res.data as Readable,
            mimeType: meta.data.mimeType ?? undefined,
            name: meta.data.name ?? undefined,
        };
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
     * Pobiera metadane plików z folderu na dysku Google
     * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
     * @param {string} parentFolderID Id folderu, z którego pobieramy pliki
     */
    static async getFilesMetaData(auth: OAuth2Client, parentFolderID: string) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.list({
            fields: 'nextPageToken, files(id, name, mimeType, lastModifyingUser, modifiedTime)',
            q: `'${parentFolderID}' in parents`, // Query to list files in the folder
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        if (!filesSchema.data.files || !filesSchema.data.files.length)
            return [];
        return filesSchema.data.files;
    }

    static async getFileOrFolderMetaDataById(auth: OAuth2Client, id: string) {
        const drive = google.drive({ version: 'v3', auth });
        const fileSchema = await drive.files.get({
            fileId: id,
            fields: 'id, name, parents, mimeType',
            supportsAllDrives: true,
        });
        return fileSchema.data;
    }

    /**
     * Pobiera plik z dysku google i zwraca go jako stream z metadanymi
     */
    static async getFileStreamWithMetaDataFromGd(
        gdFilesBasicData: any[],
        auth: OAuth2Client
    ) {
        const drive = google.drive({ version: 'v3', auth });
        // Use Promise.all to ensure all asynchronous operations complete
        const filesData = await Promise.all(
            gdFilesBasicData.map(async (fileData) => {
                const fileId = fileData.id;
                // Pobierz strumień pliku
                const res = await drive.files.get(
                    { fileId, alt: 'media', supportsAllDrives: true },
                    { responseType: 'stream' }
                );
                // Pobierz metadane pliku, aby uzyskać oryginalną nazwę
                const fileMetadata = await drive.files.get({
                    fileId,
                    fields: 'name',
                    supportsAllDrives: true,
                });

                return {
                    stream: res.data as Readable,
                    metadata: fileMetadata.data,
                };
            })
        );
        return filesData;
    }

    /**
     * Tworzy plik na dysku Google i zwraca jego id
     * @param auth
     * @param gdDocumentId
     * @param newFileName
     */
    static async exportDocToPdfAndUpload(
        auth: OAuth2Client,
        gdDocumentId: string,
        newFileName?: string
    ): Promise<string> {
        const drive = google.drive({ version: 'v3', auth });

        // Pobierz metadane pliku Google Docs, aby uzyskać nazwę i folder
        const fileMetadata = await drive.files.get({
            fileId: gdDocumentId,
            fields: 'name, parents',
            supportsAllDrives: true,
        });
        const docName = fileMetadata.data.name || newFileName;
        const parentFolderId = fileMetadata.data.parents?.[0];

        if (!parentFolderId) {
            throw new Error('Nie można znaleźć folderu dla dokumentu');
        }

        // Eksportuj dokument Google Docs jako PDF
        const res = await drive.files.export(
            {
                fileId: gdDocumentId,
                mimeType: 'application/pdf',
            },
            { responseType: 'stream' }
        );

        // Prześlij PDF do tego samego folderu na Google Drive bez bufora
        const uploadedPdf = await drive.files.create({
            requestBody: {
                name: `${docName}.pdf`,
                parents: [parentFolderId],
            },
            media: {
                mimeType: 'application/pdf',
                body: res.data as Readable, // Using the stream directly from export
            },
            fields: 'id',
            supportsAllDrives: true,
        });

        console.log(`Plik PDF utworzony i przesłany: ${uploadedPdf.data.id}`);
        return uploadedPdf.data.id!;
    }

    /**
     * Zwraca folder po jego nazwie.
     * Do sprawdzenia czy plik istnieje użyj this.fileOrFolderExists()
     * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
     */
    static async getFileMetaDataByName(
        auth: OAuth2Client,
        parameters: { parentId: string; fileName: string; isTrashed?: boolean }
    ) {
        if (!parameters.isTrashed) parameters.isTrashed = false;
        const drive = google.drive({ version: 'v3', auth });
        const escapedFileName = parameters.fileName.replace(/'/g, "\\'");
        const q = `name = '${escapedFileName}' and '${parameters.parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = ${parameters.isTrashed}`;
        const filesSchema = await drive.files.list({
            q,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        if (filesSchema.data.files && filesSchema.data.files.length) {
            filesSchema.data.files.map((file: drive_v3.Schema$File) => {});
            return filesSchema.data.files[0];
        }
    }
    /**
     * Znajduje plik po nazwie i typie MIME w danym folderze (get, bez tworzenia).
     * W odróżnieniu od getFileMetaDataByName (zaszyty mimeType folderu) pozwala
     * wskazać dowolny mimeType, np. arkusza Google.
     */
    static async getFileMetaDataByNameAndMimeType(
        auth: OAuth2Client,
        parameters: {
            parentId: string;
            fileName: string;
            mimeType: string;
            isTrashed?: boolean;
        }
    ) {
        const isTrashed = parameters.isTrashed ?? false;
        const drive = google.drive({ version: 'v3', auth });
        const escapedFileName = parameters.fileName.replace(/'/g, "\\'");
        const q = `name = '${escapedFileName}' and '${parameters.parentId}' in parents and mimeType = '${parameters.mimeType}' and trashed = ${isTrashed}`;
        const filesSchema = await drive.files.list({ q });
        if (filesSchema.data.files && filesSchema.data.files.length)
            return filesSchema.data.files[0];
    }

    /**
     * Znajduje plik, którego nazwa zaczyna się od podanego prefiksu (get, bez tworzenia).
     * Dla cyklicznie generowanych plików, których nazwa niesie zmienną część (np. datę),
     * a mimo to ma zostać jeden plik i jeden link.
     *
     * Dopasowanie nazwy robimy LOKALNIE, a nie w zapytaniu do Drive. `name contains` nie
     * jest szukaniem podciągu: dla pola `name` Drive dopasowuje tokeny, więc prefiks
     * kończący się separatorem (" - ") albo zawierający podkreślenia potrafi nie zwrócić
     * nic i plik do nadpisania zostaje nieznaleziony. Zapytanie zawęża więc tylko folder
     * i typ pliku, a `startsWith` rozstrzyga resztę.
     *
     * Gdy w folderze leży kilka pasujących plików (np. z czasów, gdy odnajdywanie nie
     * działało), bierzemy najnowszy — to ten, który użytkownik ostatnio dostał.
     */
    static async getFileMetaDataByNamePrefixAndMimeType(
        auth: OAuth2Client,
        parameters: {
            parentId: string;
            namePrefix: string;
            mimeType: string;
            isTrashed?: boolean;
        }
    ) {
        const isTrashed = parameters.isTrashed ?? false;
        const drive = google.drive({ version: 'v3', auth });
        const q = `'${parameters.parentId}' in parents and mimeType = '${parameters.mimeType}' and trashed = ${isTrashed}`;
        const filesSchema = await drive.files.list({
            q,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 1000,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        return filesSchema.data.files?.find((file) =>
            (file.name ?? '').startsWith(parameters.namePrefix)
        );
    }

    /**
     * Sprawdza czy plik lub folder istnieje
     */
    static async fileOrFolderExists(
        auth: OAuth2Client,
        fileOrFolderId: string
    ) {
        try {
            const fileSchema = await this.getFileOrFolderMetaDataById(
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
                supportsAllDrives: true,
                ...otherOptions,
            });
            return res.data;
        } catch (err) {
            console.error(`Failed to upload file ${name}`, err);
            throw err;
        }
    }

    /** Tworzy pusty natywny plik Google (Dokument / Arkusz) w danym folderze.
     * mimeType: 'application/vnd.google-apps.document' | 'application/vnd.google-apps.spreadsheet'
     */
    static async createNativeFile(
        auth: OAuth2Client,
        params: { name: string; parentId: string; mimeType: string }
    ) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.create({
            requestBody: {
                name: params.name,
                parents: [params.parentId],
                mimeType: params.mimeType,
            },
            fields: 'id,name,webViewLink',
            supportsAllDrives: true,
        });
        return filesSchema.data;
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
            supportsAllDrives: true,
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

        let folder: drive_v3.Schema$File | undefined =
            await this.getFileMetaDataByName(auth, {
                fileName: parameters.name,
                parentId: parameters.parentId,
            });
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
                supportsAllDrives: true,
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
                supportsAllDrives: true,
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
                supportsAllDrives: true,
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
                supportsAllDrives: true,
            });
            console.log(`Skopiowano plik ${originFileId}`);
            return newFile;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Tworzy skrót (shortcut) do pliku na Dysku Google.
     * @param auth Klient OAuth2.
     * @param options Opcje skrótu.
     * @param options.targetId ID pliku docelowego, do którego ma prowadzić skrót.
     * @param options.parentId ID folderu, w którym ma zostać umieszczony skrót.
     * @param options.name Nazwa, jaką ma mieć plik skrótu.
     * @returns Metadane utworzonego skrótu.
     */
    static async createShortcut(
        auth: OAuth2Client,
        options: { targetId: string; parentId: string; name: string }
    ) {
        try {
            const drive = google.drive({ version: 'v3', auth });
            
            const shortcutMetadata = {
                name: options.name,
                mimeType: 'application/vnd.google-apps.shortcut',
                parents: [options.parentId],
                shortcutDetails: {
                    targetId: options.targetId,
                },
            };
    
            const response = await drive.files.create({
                requestBody: shortcutMetadata,
                fields: 'id, name',
                supportsAllDrives: true,
            });
    
            console.log(`Utworzono skrót: "${response.data.name}" (ID: ${response.data.id}) wskazujący na plik ${options.targetId}`);
            return response.data;
        } catch (error) {
            console.error(`Nie udało się utworzyć skrótu dla pliku ${options.targetId}`, error);
            throw error;
        }
    }

    /**
     * Odczytuje metadane skrótu razem z jego celem (`shortcutDetails.targetId`).
     *
     * Osobna metoda, bo `getFileOrFolderMetaDataById` nie prosi o `shortcutDetails`
     * ani o `trashed`, a bez celu nie wolno skrótu skasować — kasowanie skrótu,
     * który wskazuje gdzie indziej, jest trudne do odkręcenia.
     */
    static async getShortcutMetaData(auth: OAuth2Client, id: string) {
        const drive = google.drive({ version: 'v3', auth });
        const fileSchema = await drive.files.get({
            fileId: id,
            fields: 'id, name, mimeType, parents, trashed, shortcutDetails',
        });
        return fileSchema.data;
    }

    /** Znajduje wszystkie skróty wskazujące na dany plik/folder (niezależnie od ich lokalizacji) */
    static async findShortcutsByTarget(auth: OAuth2Client, targetId: string) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.list({
            q: `shortcutDetails.targetId = '${targetId}' and trashed = false`,
            fields: 'files(id, name, parents)',
        });
        return filesSchema.data.files || [];
    }


    /** przenosi do kosza albo zmmienia nazwę dodając oznacznienie 'USUŃ' jeśli nie ma uprawnień */
    static async trashFileOrFolder(auth: OAuth2Client, gdFolderId: string) {
        const drive = google.drive({ version: 'v3', auth });
        try {
            const filesSchema = await drive.files.get({
                fileId: gdFolderId,
                fields: 'id, name, ownedByMe, driveId, capabilities(canTrash)',
                supportsAllDrives: true,
            });
            // Na Dysku współdzielonym `ownedByMe` jest ZAWSZE false (właścicielem
            // jest organizacja), więc o możliwości usunięcia decyduje canTrash.
            const canTrash =
                filesSchema.data.capabilities?.canTrash ??
                filesSchema.data.ownedByMe;
            if (canTrash)
                await ToolsGd.trashFile(auth, filesSchema.data.id as string);
            else
                await ToolsGd.updateFolder(auth, {
                    id: gdFolderId,
                    name: `${filesSchema.data.name} - USUŃ`,
                });
        } catch (error: any) {
            if (error.code === 404 || error.status === 404) {
                console.warn(
                    `[GD API Warning] Plik lub folder o ID ${gdFolderId} nie istnieje na Dysku Google. Pominięto przenoszenie do kosza.`
                );
                return;
            }
            throw error;
        }
    }

    /** Nadaje uprawnienia do pliku/folderu.
     *
     * Domyślnie (bez podanych `permissions`) ustawia publiczny link
     * { type: 'anyone', role: 'writer' } — historyczny sposób na to, by
     * użytkownicy otwierali w przeglądarce pliki należące do konta systemowego.
     *
     * NA DYSKU WSPÓŁDZIELONYM domyślne uprawnienie jest POMIJANE:
     * dostęp mają członkowie dysku, więc publiczny link jest zbędny, a przy
     * zablokowanym udostępnianiu zewnętrznym Google odrzuciłby to wywołanie.
     * Uprawnienia podane jawnie (np. konkretny użytkownik) są nadawane zawsze.
     *
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
        const drive = google.drive({ version: 'v3', auth });
        if (!parameters.permissions) {
            const { data } = await drive.files.get({
                fileId: parameters.fileId,
                fields: 'driveId',
                supportsAllDrives: true,
            });
            if (data.driveId) return; // Dysk współdzielony - dostęp z członkostwa
            parameters.permissions = [{ type: 'anyone', role: 'writer' }];
        }
        for (const permission of parameters.permissions) {
            let permissionSchema = await drive.permissions.create({
                requestBody: permission,
                fileId: parameters.fileId,
                fields: 'id',
                supportsAllDrives: true,
            });
            //console.log('Permission createed: %o', permissionSchema.data);
            return permissionSchema.data;
        }
    }
}
