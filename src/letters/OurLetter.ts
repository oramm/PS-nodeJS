import Letter from './Letter';
import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';
import OurLetterGdFile from './OurLetterGdFIle';
import EnviErrors from '../tools/Errors';
import { DocumentTemplateData, OurLetterData } from '../types/types';
import OurLetterGdController from './gdControlers/OurLetterGdController';
import { UserData } from '../types/sessionTypes';

export default abstract class OurLetter
    extends Letter
    implements OurLetterData
{
    _template?: DocumentTemplateData;
    isOur: true = true;
    abstract _letterGdController: OurLetterGdController;

    constructor(initParamObject: OurLetterData) {
        super(initParamObject);

        //_template jest potrzebny tylko przy tworzeniu pisma
        if (initParamObject._template)
            this._template = initParamObject._template;
    }

    /** Tworzy plik z dokumentem i ustawia this.gdDocumentId
     * PUBLIC: wywoływana z LettersController.addNewOurLetter()
     */
    async createLetterFile(auth: OAuth2Client) {
        const ourLetterGdFile = this.makeLetterGdFileController(this._template);
        const document = await ourLetterGdFile.create(auth);
        if (!document.documentId) throw new EnviErrors.NoGdIdError();
        this.gdDocumentId = document.documentId;
        return document;
    }

    async appendAttachmentsHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void> {
        await super.appendAttachmentsHandler(auth, files);
        if (!this.gdFolderId)
            throw new EnviErrors.NoGdIdError(`OurLetter: ${this.number}`);
        await this._letterGdController.appendAttachments(
            auth,
            files,
            <string>this.gdFolderId
        );
    }

    /**zmienia nazwę folderu i pliku pisma i aktualizuje dane w piśmie*/
    async editLetterGdElements(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ) {
        const letterGdFolder = await ToolsGd.getFileOrFolderMetaDataById(
            auth,
            <string>this.gdFolderId
        );
        const newFolderName = this._letterGdController.makeFolderName(
            <string>this.number,
            <string>this.creationDate
        );
        const ourLetterGdFile = this.makeLetterGdFileController();

        const promises: Promise<any>[] = [ourLetterGdFile.edit(auth)];
        if (letterGdFolder.name !== newFolderName) {
            promises.push(
                ToolsGd.updateFolder(auth, {
                    id: this.gdFolderId,
                    name: newFolderName,
                }),
                ToolsGd.updateFile(auth, {
                    id: this.gdDocumentId,
                    name: newFolderName,
                })
            );
        }
        if (files?.length > 0)
            promises.push(this.appendAttachmentsHandler(auth, files));

        await Promise.all(promises).catch((error) => {
            throw error;
        });
    }

    async exportToPDF(auth: OAuth2Client) {
        if (!this.gdDocumentId) throw new EnviErrors.NoGdIdError();
        await ToolsGd.exportDocToPdfAndUpload(auth, this.gdDocumentId);
    }

    abstract makeLetterGdFileController(
        _template?: DocumentTemplateData
    ): OurLetterGdFile;
}
