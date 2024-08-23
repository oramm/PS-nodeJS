import { ExternalOfferData, OfferBondData } from '../types/types';
import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';
import ExternalOfferGdController from './gdControllers/ExternalOfferGdController';
import OfferBond from './OfferBond/OfferBond';
import Setup from '../setup/Setup';

export default class ExternalOffer extends Offer implements ExternalOfferData {
    tenderUrl?: string | null;
    _offerBond?: OfferBond | null;
    constructor(initParamObject: ExternalOfferData) {
        super(initParamObject);
        this.initOfferBond(initParamObject._offerBond);
        this.tenderUrl = initParamObject.tenderUrl;
    }

    private initOfferBond(offerBondData: OfferBondData | undefined | null) {
        if (offerBondData) {
            offerBondData.offerId = this.id;
            this._offerBond = new OfferBond(offerBondData);
        } else this._offerBond = null;
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

    async editController(auth: OAuth2Client) {
        await super.editController(auth);
        if (this._offerBond) {
            this._offerBond.status = Setup.OfferBondStatus.DONE;
        }
        this._offerBond && (await this._offerBond.editController(this));
    }
    async addNewOfferBondController() {
        if (!this._offerBond) throw new Error('No OfferBond data');
        await this._offerBond.addNewController();
    }

    async editOfferBondController() {
        if (!this._offerBond) throw new Error('No OfferBond data');
        await this._offerBond.editController(this);
    }

    async deleteOfferBondController() {
        if (!this._offerBond) throw new Error('No OfferBond data');
        await this._offerBond.deleteController();
        console.log('OfferBond deleted', this._offerBond);
        this._offerBond = null;
    }
}
