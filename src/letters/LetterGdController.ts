import { OAuth2Client } from 'google-auth-library';
import ToolsDocs from "../tools/ToolsDocs";
import Letter from "./Letter";
import { Envi } from "../tools/EnviTypes";
import { drive_v3 } from "googleapis";
import ToolsGd from "../tools/ToolsGd";
import EnviErrors from '../tools/Errors';

export default class LetterGdController {

    static makeFolderName(number: string, creationDate: string) {
        return `${number} ${creationDate}`;
    }

    /** Tworzy folder pisma - nie zmienia letterData*/
    static async createLetterFolder(auth: OAuth2Client, letterData: Letter) {
        const letterNumber = letterData.number?.toString() || 'NO_NUMBER_YET'
        const folderName = this.makeFolderName(letterNumber, <string>letterData.creationDate);
        const letterFolder = await ToolsGd.createFolder(
            auth,
            { name: folderName, parents: [letterData._project.lettersGdFolderId] }
        );

        ToolsGd.createPermissions(auth, { fileId: <string>letterFolder.id });
        return letterFolder;
    }

    /** Dla pism z folderem usuwa folder pisma dla pism bez folderu (z pojedynczym plikiem) usuwa plik pisma */
    static async deleteFromGd(auth: OAuth2Client, documentGdId?: string | undefined | null, folderGdId?: string | null) {
        const gdIdToDelete = folderGdId || documentGdId;
        if (!gdIdToDelete) throw new EnviErrors.NoGdIdError('Document must have folderFdId');
        await ToolsGd.trashFileOrFolder(auth, gdIdToDelete);
    }

    /** 
     * - Wrzuca pliki do folderu pisma - folder musi być wcześniej utworzony 
     **/
    static async appendAttachments(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[], letterFolderGdId: string) {
        await this.uploadAttachments(auth, blobEnviObjects, letterFolderGdId);
    }

    /**
     * Wgrywa pliki załączników na serwer - folder pisma musi istnieć
     * @param auth 
     * @param blobEnviObjects 
     * @param parentFolderGdId 
     */
    protected static async uploadAttachments(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[], parentFolderGdId: string) {
        const promises = [];
        for (const blobEnvi of blobEnviObjects) {
            blobEnvi.parent = parentFolderGdId;
            promises.push(ToolsGd.uploadFileGPT(auth, blobEnvi, undefined, parentFolderGdId));
        }
        await Promise.all(promises);
    }
}