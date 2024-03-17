import { OAuth2Client } from 'google-auth-library';
import Offer from './Offer';

import ToolsGd from '../tools/ToolsGd';
import Setup from '../setup/Setup';

export default class OfferGdController {
    static makeFolderName(
        typeName: string,
        alias: string,
        submissionDeadline: string
    ) {
        return `${typeName} ${alias} ${submissionDeadline}`;
    }

    /** Tworzy folder oferty w folderze _city - nie zmienia offerData*/
    static async createOfferFolder(auth: OAuth2Client, offerData: Offer) {
        if (!offerData._city)
            throw new Error('Brak miasta w przypisanego do oferty');
        if (!offerData._type)
            throw new Error('Brak typu w przypisanego do oferty');
        if (!offerData.submissionDeadline)
            throw new Error('Brak terminu składania oferty');

        const {
            _city,
            _type,
            employerName: employer,
            submissionDeadline,
            alias,
        } = offerData;
        const cityFolder = await ToolsGd.setFolder(auth, {
            name: _city.name,
            parentId: Setup.Gd.offersRootFolderId,
        });

        const folderName = this.makeFolderName(
            _type.name,
            alias,
            offerData.submissionDeadline
        );
        const offerFolder = await ToolsGd.createFolder(auth, {
            name: folderName,
            parents: [cityFolder.id as string],
        });

        ToolsGd.createPermissions(auth, { fileId: <string>offerFolder.id });
        return offerFolder;
    }

    /** Usuwa folder oferty */
    static async deleteFromGd(auth: OAuth2Client, gdFolderId: string) {
        try {
            await ToolsGd.trashFileOrFolder(auth, gdFolderId);
        } catch (error) {
            console.log('Oferta nie miała folderu, więc nic nie usuwam');
        }
    }

    /** Wrzuca pliki do folderu oferty - folder musi być wcześniej utworzony */
    static async appendAttachments(
        auth: OAuth2Client,
        files: Express.Multer.File[],
        offerGdFolderId: string
    ) {
        await this.uploadAttachments(auth, files, offerGdFolderId);
    }

    /**
     * Wgrywa pliki załączników na serwer - folder oferty musi istnieć
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
        });
        await Promise.all(promises);
    }
}
