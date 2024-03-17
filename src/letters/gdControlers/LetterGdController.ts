import { OAuth2Client } from 'google-auth-library';

import ToolsGd from '../../tools/ToolsGd';
import EnviErrors from '../../tools/Errors';
import { LetterData } from '../../types/types';

export default abstract class LetterGdController {
    static makeFolderName(number: string, creationDate: string) {
        return `${number} ${creationDate}`;
    }

    /** Tworzy folder pisma - nie zmienia letterData*/
    static async createLetterFolder(
        auth: OAuth2Client,
        letterData: LetterData
    ) {
        const letterNumber = letterData.number?.toString() || 'NO_NUMBER_YET';
        const folderName = this.makeFolderName(
            letterNumber,
            <string>letterData.creationDate
        );
        const letterFolder = await ToolsGd.createFolder(auth, {
            name: folderName,
            parents: [this.makeParentFolderGdId(letterData)],
        });

        ToolsGd.createPermissions(auth, { fileId: <string>letterFolder.id });
        return letterFolder;
    }

    /** Dla pism z folderem usuwa folder pisma dla pism bez folderu (z pojedynczym plikiem) usuwa plik pisma */
    static async deleteFromGd(
        auth: OAuth2Client,
        gdDocumentId?: string | undefined | null,
        gdFolderId?: string | null
    ) {
        const gdIdToDelete = gdFolderId || gdDocumentId;
        if (!gdIdToDelete)
            throw new EnviErrors.NoGdIdError('Document must have folderFdId');
        await ToolsGd.trashFileOrFolder(auth, gdIdToDelete);
    }

    /**
     * - Wrzuca pliki do folderu pisma - folder musi być wcześniej utworzony
     **/
    static async appendAttachments(
        auth: OAuth2Client,
        files: Express.Multer.File[],
        letterGdFolderId: string
    ) {
        await this.uploadAttachments(auth, files, letterGdFolderId);
    }

    /**
     * Wgrywa pliki załączników na serwer - folder pisma musi istnieć
     * @param auth
     * @param files
     * @param parentGdFolderId
     */
    protected static async uploadAttachments(
        auth: OAuth2Client,
        files: Express.Multer.File[],
        parentGdFolderId: string
    ) {
        const promises = files.map((file) => {
            return ToolsGd.uploadFileMulter(
                auth,
                file,
                undefined,
                parentGdFolderId
            );
            //blobEnvi.parent = parentGdFolderId;
            //promises.push(ToolsGd.uploadFileBase64(auth, blobEnvi, undefined, parentGdFolderId));
        });
        await Promise.all(promises);
    }

    static makeParentFolderGdId(letterData: LetterData): string {
        throw new Error('Method not implemented in sublass.');
    }
}
