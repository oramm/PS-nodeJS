
import Letter from './Letter';
import { auth, OAuth2Client } from 'google-auth-library';
import { Envi } from '../tools/EnviTypes';

import ToolsGd from '../tools/ToolsGd';
import Tools from '../tools/Tools';
import { drive_v3 } from 'googleapis';

export default class IncomingLetter extends Letter {
    constructor(initParamObject: any) {
        super(initParamObject);
        this.number = initParamObject.number;
    }

    async initialise(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        try {
            this.letterFilesCount = blobEnviObjects.length;
            if (blobEnviObjects.length > 1)
                await this.createLetterFolder(auth, blobEnviObjects);
            else
                await this.createLetterFile(auth, blobEnviObjects[0]);

            await this.addInDb();
        } catch (err) {
            this.deleteFromGd(auth);
        }
    }

    /** Używać tylko gdy mamy pojedynczego bloba */
    protected async createLetterFile(auth: OAuth2Client, blobEnviObject: Envi._blobEnviObject) {
        blobEnviObject.parent = this._project.lettersGdFolderId
        const letterFile = await ToolsGd.uploadFile(auth, blobEnviObject);

        this.documentGdId = <string>letterFile?.id;
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(this.documentGdId);
        this.folderGdId = undefined;
        this._gdFolderUrl = undefined;

        return letterFile;
    }

    public async appendAttachments(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        this.letterFilesCount += blobEnviObjects.length;
        let letterFolder;
        //był tylko jeden plik pisma bez załaczników
        if (!this.folderGdId && this.documentGdId) {
            const letterFile = await ToolsGd.getFileOrFolderById(auth, this.documentGdId)
            letterFolder = await this.createLetterFolder(auth, blobEnviObjects);
            ToolsGd.moveFileOrFolder(auth, letterFile, <string>letterFolder.id)

            this._documentOpenUrl = undefined;
            this.documentGdId = '';
        }
        //folder pisma istnieje
        else {
            const promises = [];
            for (const blobEnvi of blobEnviObjects) {
                blobEnvi.parent = this.folderGdId;
                promises.push(ToolsGd.uploadFile(auth, blobEnvi));
            }
            await Promise.all(promises);
        }
    }

    async editLetterGdElements(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        let letterGdElement: drive_v3.Schema$File;
        //użytkownik chce zmienić plik
        if (blobEnviObjects.length > 0) {
            await this.deleteFromGd(auth);
            this.letterFilesCount = blobEnviObjects.length;
            if (blobEnviObjects.length > 1) {
                letterGdElement = await this.createLetterFolder(auth, blobEnviObjects);
                this.folderGdId = <string>letterGdElement.id;
                this._gdFolderUrl = ToolsGd.createDocumentOpenUrl(this.folderGdId);

            } else {
                letterGdElement = await this.createLetterFile(auth, blobEnviObjects[0]);
                this.documentGdId = <string>letterGdElement.id;
                this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(this.documentGdId);
            }
        } else
            letterGdElement = await ToolsGd.getFileOrFolderById(auth, <string>(this.documentGdId || this.folderGdId));
    }
}