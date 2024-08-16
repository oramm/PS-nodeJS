import { OAuth2Client } from 'google-auth-library';

import ToolsGd from '../../tools/ToolsGd';
import Setup from '../../setup/Setup';
import { OfferData } from '../../types/types';

export default class OfferGdController {
    makeFolderName(
        typeName: string,
        alias: string,
        submissionDeadline: string,
        cityName: string
    ) {
        return `${typeName} ${cityName} ${alias} ${submissionDeadline}`;
    }

    /** Tworzy folder oferty w folderze _city - nie zmienia offerData*/
    async createOfferFolder(auth: OAuth2Client, offerData: OfferData) {
        if (!offerData._city)
            throw new Error('Brak miasta w przypisanego do oferty');
        if (!offerData._type)
            throw new Error('Brak typu w przypisanego do oferty');
        if (!offerData.submissionDeadline)
            throw new Error('Brak terminu składania oferty');

        const { _city, _type, alias } = offerData;
        const cityFolder = await ToolsGd.setFolder(auth, {
            name: _city.name,
            parentId: Setup.Gd.offersRootFolderId,
        });

        const folderName = this.makeFolderName(
            _type.name,
            alias,
            offerData.submissionDeadline,
            _city.name
        );
        const offerFolder = await ToolsGd.createFolder(auth, {
            name: folderName,
            parents: [cityFolder.id as string],
        });

        ToolsGd.createPermissions(auth, { fileId: <string>offerFolder.id });
        return offerFolder;
    }

    /** Usuwa folder oferty */
    async deleteFromGd(auth: OAuth2Client, gdFolderId: string) {
        try {
            await ToolsGd.trashFileOrFolder(auth, gdFolderId);
        } catch (error) {
            console.log('Oferta nie miała folderu, więc nic nie usuwam');
        }
    }
}
