import Letter from './Letter';
import { auth, OAuth2Client } from 'google-auth-library';
import { Envi } from '../tools/EnviTypes';

import ToolsGd from '../tools/ToolsGd';
import Tools from '../tools/Tools';
import { drive_v3 } from 'googleapis';
import IncomingLetterGdController from './IncomingLetterGdController';
import EnviErrors from '../tools/Errors';

export default class IncomingLetter extends Letter {
    constructor(initParamObject: any) {
        super(initParamObject);
        this.number = initParamObject.number;
    }

    async initialise(auth: OAuth2Client, files: Express.Multer.File[] = []) {
        try {
            this.letterFilesCount = files.length;
            if (files.length > 1) {
                await this.initAttachmentsHandler(auth, files);
            } else {
                const letterGdFile = await this.createLetterFile(
                    auth,
                    files[0]
                );
                if (!letterGdFile.id)
                    throw new EnviErrors.NoGdIdError(`: incomingLetter`);
                this.setDataToSingleFileState(letterGdFile.id);
            }
            await this.addInDb();
        } catch (err) {
            this.deleteFromDb();
            IncomingLetterGdController.deleteFromGd(
                auth,
                this.gdFolderId || this.gdDocumentId
            );
            throw err;
        }
    }

    /** Używać tylko gdy mamy pojedynczego bloba  należy pamiętać o użyciu potem
     *  setToSingleFileState(gdDocumentId: string)
     */
    protected async createLetterFile(
        auth: OAuth2Client,
        file: Express.Multer.File
    ) {
        if (!this._project.lettersGdFolderId)
            throw new EnviErrors.NoGdIdError(`: lettersGdFolderId`);
        const parentGdFolderId = this._project.lettersGdFolderId;
        const letterFile = await ToolsGd.uploadFileMulter(
            auth,
            file,
            undefined,
            parentGdFolderId
        );
        return letterFile;
    }

    async editLetterGdElements(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ) {
        //użytkownik chce zmienić plik
        if (files.length > 0) {
            await this.replaceAttachmentsHandler(auth, files);
        } else if (this.gdFolderId) {
            await this.editLetterGdFolder(auth);
        }
    }

    /**zmienia tylko nazwę folderu */
    private async editLetterGdFolder(auth: OAuth2Client) {
        const letterGdFolder = await ToolsGd.getFileOrFolderById(
            auth,
            <string>this.gdFolderId
        );
        const newFolderName = IncomingLetterGdController.makeFolderName(
            <string>this.number,
            <string>this.creationDate
        );
        if (letterGdFolder.name !== newFolderName)
            await ToolsGd.updateFolder(auth, {
                name: newFolderName,
                id: letterGdFolder.id,
            });
        return letterGdFolder;
    }

    /**
     * - Wykonuje operacje na Gd związane z utworzeniem załączników
     * - jeśli trzeba to tworzy letterFolder
     */
    private async initAttachmentsHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void> {
        if (files.length > 1) await this.setToMultiStateHandler(auth, files);
        else await this.setToSingleStateHandler(auth, files);
    }

    /**
     * - Wykonuje operacje na Gd związane z zastąpieniem poprzednich załączników
     * - jeśli trzeba to tworzy letterFolder
     * -  usuwa stare załączniki
     */
    private async replaceAttachmentsHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void> {
        const oldGdFolderId = this.gdFolderId;
        const oldGdDocumentId = this.gdDocumentId;
        await this.initAttachmentsHandler(auth, files);
        await IncomingLetterGdController.deleteFromGd(
            auth,
            oldGdDocumentId,
            oldGdFolderId
        );
    }

    /** Wykonuje operacje na Gd związane z dodaniem kolejnych załączników używać gdy jest pewność, że utworzono letterFolder
     *  jeżeli nie utworzono jeszcze folderu nalezy użyć this.makeMultiFileGdElements
     */
    async appendAttachmentsHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void> {
        const newFilesCount = this.letterFilesCount + files.length;
        //await super.appendAttachmentsHandler(auth, blobEnviObjects);
        if (!files.length) throw new Error('no Files to append');
        if (!this.gdFolderId) await this.setToMultiStateHandler(auth, files);
        else
            await IncomingLetterGdController.appendAttachments(
                auth,
                files,
                <string>this.gdFolderId
            );
        this.letterFilesCount = newFilesCount;
    }

    private async setToSingleStateHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ) {
        const letterGdFile = await this.createLetterFile(auth, files[0]);
        if (!letterGdFile.id)
            throw new EnviErrors.NoGdIdError(`: incomingLetter`);
        this.setDataToSingleFileState(letterGdFile.id);
    }

    private async setToMultiStateHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ) {
        const newLetterGdFolder =
            await IncomingLetterGdController.createLetterFolder(auth, {
                ...this,
            });
        const letterGdDocumentId = this.gdDocumentId;
        if (!newLetterGdFolder.id)
            throw new EnviErrors.NoGdIdError(
                ` - incoming letter folder not created for ${this.number}`
            );
        if (!letterGdDocumentId)
            throw new EnviErrors.NoGdIdError(
                `no letter  GdId for ${this.number}`
            );
        //był tylko jeden plik pisma bez załaczników - teraz trzeba przenieść poprzedni plik do nowego folderu

        await IncomingLetterGdController.moveLetterFIletoFolder(
            letterGdDocumentId,
            auth,
            newLetterGdFolder.id
        );
        this.setDataToMultiFileState(newLetterGdFolder.id, files.length);
        await IncomingLetterGdController.appendAttachments(
            auth,
            files,
            <string>this.gdFolderId
        );
    }

    private setDataToSingleFileState(gdDocumentId: string) {
        this.gdDocumentId = gdDocumentId;
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(gdDocumentId);
        this._gdFolderUrl = '';
        this.gdFolderId = undefined;
        this.letterFilesCount = 1;
    }

    private setDataToMultiFileState(gdFolderId: string, filesCount: number) {
        this.gdFolderId = gdFolderId;
        this.gdDocumentId = undefined;
        this._gdFolderUrl = ToolsGd.createDocumentOpenUrl(gdFolderId);
        this._documentOpenUrl = undefined;
        this.letterFilesCount = filesCount;
    }
}
