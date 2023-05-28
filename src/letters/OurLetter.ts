
import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import Letter from './Letter';
import { OAuth2Client } from 'google-auth-library';
import { Envi } from '../tools/EnviTypes';
import ToolsGd from '../tools/ToolsGd';
import OurLetterGdFile from './OurLetterGdFIle';
import EnviErrors from '../tools/Errors';
import LetterGdController from './LetterGdController';
import OurLetterGdController from './OurLetterGdController';


export default class OurLetter extends Letter {
    _template?: DocumentTemplate;
    isOur: boolean = true;

    constructor(initParamObject: any) {
        super(initParamObject);
        this.number = initParamObject.number;

        //_template jest potrzebny tylko przy tworzeniu pisma
        if (initParamObject._template)
            this._template = initParamObject._template;
    }

    async initialise(auth: OAuth2Client, files: Express.Multer.File[] = []) {
        try {
            const gdFolder = await LetterGdController.createLetterFolder(auth, { ...this });
            this.folderGdId = <string>gdFolder.id;
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(this.folderGdId);
            const letterGdFile = await this.createLetterFile(auth);
            this.documentGdId = <string>letterGdFile.documentId;
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(this.documentGdId);

            await this.addInDb();
            const ourLetterGdFile = new OurLetterGdFile({ enviDocumentData: { ...this } })
            if (!this.number) throw new Error(`Letter number not set for: ${this.id}`);
            if (!this.creationDate) throw new Error(`Letter creationDate is  not set for: ${this.id}`);

            const folderName = OurLetterGdController.makeFolderName(this.number.toString(), this.creationDate)
            await Promise.all([
                ourLetterGdFile.updateTextRunsInNamedRanges(auth),
                ToolsGd.updateFolder(auth, { id: this.folderGdId, name: folderName }),
                ToolsGd.updateFile(auth, { id: this.documentGdId, name: folderName }),
                (files.length > 0) ? this.appendAttachmentsHandler(auth, files) : undefined,
            ]).catch((error) => { throw (error) });

        } catch (err) {
            if (this.id) this.deleteFromDb();
            OurLetterGdController.deleteFromGd(auth, null, this.folderGdId);
            throw (err);
        }
    }

    async addInDb() {
        await super.addInDb();
        this.number = this.id;
    }

    /** Tworzy plik z dokumentem i ustawia this.documentGdId */
    private async createLetterFile(auth: OAuth2Client) {
        const ourLetterGdFile = new OurLetterGdFile({ _template: this._template, enviDocumentData: { ...this } })
        const document = await ourLetterGdFile.create(auth);
        if (!document.documentId) throw new EnviErrors.NoGdIdError();
        this.documentGdId = document.documentId;
        return document;
    }

    async appendAttachmentsHandler(auth: OAuth2Client, files: Express.Multer.File[]): Promise<void> {
        await super.appendAttachmentsHandler(auth, files);
        if (!this.folderGdId) throw new EnviErrors.NoGdIdError(`OurLetter: ${this.number}`);
        await OurLetterGdController.appendAttachments(auth, files, <string>this.folderGdId);
    }

    /**zmienia nazwę folderu i pliku pisma i aktualizuje dane w piśmie*/
    async editLetterGdElements(auth: OAuth2Client, files: Express.Multer.File[]) {
        const letterGdFolder = await ToolsGd.getFileOrFolderById(auth, <string>(this.folderGdId));
        const newFolderName = OurLetterGdController.makeFolderName(<string>this.number, <string>this.creationDate);
        const ourLetterGdFile = new OurLetterGdFile({ enviDocumentData: { ...this } })

        const promises: Promise<any>[] = [ourLetterGdFile.edit(auth)];
        if (letterGdFolder.name !== newFolderName) {
            promises.push(
                ToolsGd.updateFolder(auth, { id: this.folderGdId, name: newFolderName }),
                ToolsGd.updateFile(auth, { id: this.documentGdId, name: newFolderName }),
            );
        }
        if (files?.length > 0)
            promises.push(this.appendAttachmentsHandler(auth, files));

        await Promise.all(promises)
            .catch((error) => { throw (error) });

        //await ToolsGd.updateFolder(auth, { name: newFolderName, id: letterGdFolder.id });
    }
}