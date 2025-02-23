import Letter from './Letter';
import { auth, OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';
import IncomingLetterGdController from './gdControlers/IncomingLetterGdController';
import EnviErrors from '../tools/Errors';
import { IncomingLetterData } from '../types/types';
import { UserData } from '../setup/GAuth2/sessionTypes';

export default abstract class IncomingLetter
    extends Letter
    implements IncomingLetterData
{
    isOur: false = false;
    abstract _letterGdController: IncomingLetterGdController;

    constructor(initParamObject: IncomingLetterData) {
        super(initParamObject);
        this.number = initParamObject.number;
    }

    async addNewController(
        auth: OAuth2Client,
        files: Express.Multer.File[] = [],
        userData: UserData
    ) {
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
            await this.createNewLetterEvent(userData);
        } catch (err) {
            this.deleteFromDb();
            this._letterGdController.deleteFromGd(
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
        const parentGdFolderId = this.makeParentFolderGdId();
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
    protected async editLetterGdFolder(auth: OAuth2Client) {
        const letterGdFolder = await ToolsGd.getFileOrFolderMetaDataById(
            auth,
            <string>this.gdFolderId
        );
        const newFolderName = this._letterGdController.makeFolderName(
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

        try {
            await this.initAttachmentsHandler(auth, files);
        } catch (error) {
            console.error('Error during initAttachmentsHandler:', error);
            if (!(error instanceof Error))
                throw new Error(
                    'Unexpected error during initAttachmentsHandler'
                );
            throw new Error(
                `Error during initAttachmentsHandler: ${error.message}`
            );
        }

        try {
            await this._letterGdController.deleteFromGd(
                auth,
                oldGdDocumentId,
                oldGdFolderId
            );
        } catch (error) {
            console.error('Error during deleteFromGd:', error);
            if (!(error instanceof Error))
                throw new Error(
                    'Unexpected error during initAttachmentsHandler'
                );
            throw new Error(`Error during deleteFromGd: ${error.message}`);
        }
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
            await this._letterGdController.appendAttachments(
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
            await this._letterGdController.createLetterFolder(auth, {
                ...this,
            });
        if (!newLetterGdFolder.id)
            throw new EnviErrors.NoGdIdError(
                ` - incoming letter folder not created for ${this.number}`
            );

        const letterGdDocumentId = this.gdDocumentId;

        //był tylko jeden plik pisma bez załaczników - teraz trzeba przenieść poprzedni plik do nowego folderu
        if (letterGdDocumentId)
            await this._letterGdController.moveLetterFiletoFolder(
                letterGdDocumentId,
                auth,
                newLetterGdFolder.id
            );
        this.setDataToMultiFileState(newLetterGdFolder.id, files.length);
        await this._letterGdController.appendAttachments(
            auth,
            files,
            <string>this.gdFolderId
        );
    }

    private setDataToSingleFileState(gdDocumentId: string) {
        this.gdDocumentId = gdDocumentId;
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(gdDocumentId);
        this._gdFolderUrl = '';
        this.gdFolderId = null;
        this.letterFilesCount = 1;
    }

    private setDataToMultiFileState(gdFolderId: string, filesCount: number) {
        this.gdFolderId = gdFolderId;
        this.gdDocumentId = null;
        this._gdFolderUrl = ToolsGd.createDocumentOpenUrl(gdFolderId);
        this._documentOpenUrl = undefined;
        this.letterFilesCount = filesCount;
    }

    abstract makeParentFolderGdId(): string;
}
