import { ExternalOfferData } from '../types/types';
import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';
import ExternalOfferGdController from './gdControllers/ExternalOfferGdController';

export default class ExternalOffer extends Offer implements ExternalOfferData {
    tenderUrl?: string | null;
    constructor(initParamObject: ExternalOfferData) {
        super(initParamObject);
        this.tenderUrl = initParamObject.tenderUrl;
    }

    async addNewController(auth: OAuth2Client) {
        await super.addNewController(auth);
        const offerGdController = new ExternalOfferGdController();
        const { offerContentFolder, specsFolder } =
            await offerGdController.createExternalOfferFolders(auth, {
                ...this,
            });
        //musi być po utworzeniu cases w bazie danych
        await offerGdController.moveFoldersToMakeOfferFolder(
            auth,
            { ...this },
            offerContentFolder,
            specsFolder
        );
    }
}
