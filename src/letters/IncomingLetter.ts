
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

    async initialise(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        try {
            this.letterFilesCount = blobEnviObjects.length;
            if (blobEnviObjects.length > 1) {
                await this.initAttachmentsHandler(auth, blobEnviObjects);
            } else {
                const letterGdFile = await this.createLetterFile(auth, blobEnviObjects[0]);
                if (!letterGdFile.id) throw new EnviErrors.NoGdIdError(`: incomingLetter`);
                this.setDataToSingleFileState(letterGdFile.id);
            }
            await this.addInDb();
        } catch (err) {
            IncomingLetterGdController.deleteFromGd(auth, this.folderGdId || this.documentGdId);
        }
    }

    /** Używać tylko gdy mamy pojedynczego bloba  należy pamiętać o użyciu potem 
     *  setToSingleFileState(documentGdId: string)
     */
    protected async createLetterFile(auth: OAuth2Client, blobEnviObject: Envi._blobEnviObject) {
        blobEnviObject.parent = this._project.lettersGdFolderId
        const letterFile = await ToolsGd.uploadFileGPT(auth, blobEnviObject);
        return letterFile;
    }

    async editLetterGdElements(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        //użytkownik chce zmienić plik
        if (blobEnviObjects.length > 0) {
            await this.replaceAttachmentsHandler(auth, blobEnviObjects);
        } else if (this.folderGdId) {
            await this.editLetterGdFolder(auth);
        }
    }

    /**zmienia tylko nazwę folderu */
    private async editLetterGdFolder(auth: OAuth2Client) {
        const letterGdFolder = await ToolsGd.getFileOrFolderById(auth, <string>(this.folderGdId));
        const newFolderName = IncomingLetterGdController.makeFolderName(<string>this.number, <string>this.creationDate);
        if (letterGdFolder.name !== newFolderName)
            await ToolsGd.updateFolder(auth, { name: newFolderName, id: letterGdFolder.id });
        return letterGdFolder;
    }

    /** 
     * - Wykonuje operacje na Gd związane z utworzeniem załączników 
     * - jeśli trzeba to tworzy letterFolder
    */
    private async initAttachmentsHandler(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]): Promise<void> {
        if (blobEnviObjects.length > 1)
            await this.setToMultiStateHandler(auth, blobEnviObjects);
        else
            await this.setToSingleStateHandler(auth, blobEnviObjects);
    }

    /** 
     * - Wykonuje operacje na Gd związane z zastąpieniem poprzednich załączników 
     * - jeśli trzeba to tworzy letterFolder
     * -  usuwa stare załączniki
    */
    private async replaceAttachmentsHandler(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]): Promise<void> {
        const oldFolderGdId = this.folderGdId;
        const oldDocumentGdId = this.documentGdId;
        await this.initAttachmentsHandler(auth, blobEnviObjects);
        await IncomingLetterGdController.deleteFromGd(auth, oldDocumentGdId, oldFolderGdId);
    }

    /** Wykonuje operacje na Gd związane z dodaniem kolejnych załączników używać gdy jest pewność, że utworzono letterFolder 
     *  jeżeli nie utworzono jeszcze folderu nalezy użyć this.makeMultiFileGdElements 
    */
    async appendAttachmentsHandler(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]): Promise<void> {
        const newFilesCount = this.letterFilesCount + blobEnviObjects.length;
        //await super.appendAttachmentsHandler(auth, blobEnviObjects);
        if (!blobEnviObjects.length) throw new Error('no Files to append');
        if (!this.folderGdId)
            await this.setToMultiStateHandler(auth, blobEnviObjects);
        else
            await IncomingLetterGdController.appendAttachments(auth, blobEnviObjects, <string>this.folderGdId);
        this.letterFilesCount = newFilesCount;
    }

    private async setToSingleStateHandler(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        const letterGdFile = await this.createLetterFile(auth, blobEnviObjects[0]);
        if (!letterGdFile.id)
            throw new EnviErrors.NoGdIdError(`: incomingLetter`);
        this.setDataToSingleFileState(letterGdFile.id);
    }

    private async setToMultiStateHandler(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        const newLetterGdFolder = await IncomingLetterGdController.createLetterFolder(auth, { ...this });
        const letterDocumentGdId = this.documentGdId;
        if (!newLetterGdFolder.id) throw new EnviErrors.NoGdIdError(` - incoming letter folder not created for ${this.number}`);
        if (!letterDocumentGdId) throw new EnviErrors.NoGdIdError(`no letter  GdId for ${this.number}`)
        //był tylko jeden plik pisma bez załaczników - teraz trzeba przenieść poprzedni plik do nowego folderu

        await IncomingLetterGdController.moveLetterFIletoFolder(letterDocumentGdId, auth, newLetterGdFolder.id);
        this.setDataToMultiFileState(newLetterGdFolder.id, blobEnviObjects.length);
        await IncomingLetterGdController.appendAttachments(auth, blobEnviObjects, <string>this.folderGdId);
    }

    private setDataToSingleFileState(documentGdId: string) {
        this.documentGdId = documentGdId;
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(documentGdId);
        this._gdFolderUrl = '';
        this.folderGdId = null;
        this.letterFilesCount = 1;
    }

    private setDataToMultiFileState(folderGdId: string, blobsCount: number) {
        this.folderGdId = folderGdId;
        this.documentGdId = null;
        this._gdFolderUrl = ToolsGd.createDocumentOpenUrl(folderGdId);
        this._documentOpenUrl = undefined;
        this.letterFilesCount = blobsCount;
    }
}