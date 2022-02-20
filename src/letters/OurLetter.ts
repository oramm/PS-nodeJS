
import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import Letter from './Letter';
import { OAuth2Client } from 'google-auth-library';
import { Envi } from '../tools/EnviTypes';
import ToolsGd from '../tools/ToolsGd';
import OurLetterGdFile from './OurLetterGdFIle';

export default class OurLetter extends Letter {
    _template: DocumentTemplate | undefined;
    isOur: boolean = true;

    constructor(initParamObject: any) {
        super(initParamObject);
        this.number = initParamObject.number;

        //_template jest potrzebny tylko przy tworzeniu pisma
        if (initParamObject._template)
            this._template = initParamObject._template;
    }

    async initialise(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        try {
            await this.createLetterFolder(auth, blobEnviObjects);
            await this.createLetterFile(auth);
            await this.addInDb();
        } catch (err) {
            this.deleteFromGd(auth);
        }
    }

    private async createLetterFile(auth: OAuth2Client) {
        if (!this._template) throw new Error('OurLetter must have Template');
        else {
            const ourLetterGdFile = new OurLetterGdFile({ _template: this._template, document: this })
            await ourLetterGdFile.create(auth);
        }
    }

    makeFolderName(): string {
        let folderName: string = super.makeFolderName();
        return folderName += ': Przychodzące'
    }

    public async appendAttachments(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        const promises = [];
        for (const blobEnvi of blobEnviObjects) {
            blobEnvi.parent = this.folderGdId;
            promises.push(ToolsGd.uploadFile(auth, blobEnvi));
        }
        await Promise.all(promises);
    }


    async editLetterGdElements(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        if (!this._template) throw new Error('OurLetter must have Template');
        else {
            const ourLetterGdFile = new OurLetterGdFile({ _template: this._template, document: this })
            ourLetterGdFile.edit(auth);
        }
    }
}
