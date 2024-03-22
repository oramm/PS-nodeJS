import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../../tools/ToolsGd';
import OfferGdController from './OfferGdController';
import { ExternalOfferData } from '../../types/types';
import EnviErrors from '../../tools/Errors';
import CasesController from '../../contracts/milestones/cases/CasesController';
import { drive_v3 } from 'googleapis';

export default class ExternalOfferGdController extends OfferGdController {
    /** Tworzy folder oferty w folderze _city - nie zmienia offerData*/
    async createOfferFolder(auth: OAuth2Client, offerData: ExternalOfferData) {
        const offerFolder = await super.createOfferFolder(auth, offerData);
        return offerFolder;
    }

    async createExternalOfferFolders(
        auth: OAuth2Client,
        offerData: ExternalOfferData
    ) {
        if (!offerData.gdFolderId)
            throw new EnviErrors.NoGdIdError('Brak folderu oferty');

        console.log('Tworzenie podfolderów');
        let offerContentFolder: drive_v3.Schema$File,
            specsFolder: drive_v3.Schema$File;
        [offerContentFolder, specsFolder] = await Promise.all([
            ToolsGd.setFolder(auth, {
                parentId: offerData.gdFolderId,
                name: 'SWZ',
            }),
            ToolsGd.setFolder(auth, {
                parentId: offerData.gdFolderId,
                name: 'Oferta',
            }),
        ]);

        return { offerContentFolder, specsFolder };
    }

    async getMakeOfferCaseFolderId(
        auth: OAuth2Client,
        offerData: ExternalOfferData
    ) {
        if (!offerData.gdFolderId) throw new EnviErrors.NoGdIdError();
        if (!offerData.id) throw new Error('Brak id oferty');
        const makeOfferCases = await CasesController.getCasesList(
            [{ offerId: offerData.id, typeId: 100 }] // 100 - CaseTypes.id dla typu sprawy "Przygotowanie oferty"
        );

        if (makeOfferCases.length !== 1)
            throw new Error('Wrong number of cases');
        const makeOfferCase = makeOfferCases[0];
        if (!makeOfferCase.gdFolderId)
            throw new EnviErrors.NoGdIdError('Brak folderu sprawy');
        return makeOfferCase.gdFolderId;
    }

    async moveFoldersToMakeOfferFolder(
        auth: OAuth2Client,
        offerData: ExternalOfferData,
        offerContentFolder: drive_v3.Schema$File,
        specsFolder: drive_v3.Schema$File
    ) {
        const makeOferCaseGdId = await this.getMakeOfferCaseFolderId(
            auth,
            offerData
        );

        await Promise.all([
            ToolsGd.moveFileOrFolder(
                auth,
                offerContentFolder,
                makeOferCaseGdId
            ),
            ToolsGd.moveFileOrFolder(auth, specsFolder, makeOferCaseGdId),
        ]);
    }
}
