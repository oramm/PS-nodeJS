import Offer, { OfferInitParams } from './Offer';
import { OAuth2Client } from 'google-auth-library';
import OfferGdController from './OfferGdController';

export default class OurOffer extends Offer {
    gdDocumentId: string;
    constructor(initParamObject: OfferInitParams & { gdGileId: string }) {
        super(initParamObject);
        this.gdDocumentId = initParamObject.gdGileId;
    }

    async createGdElements(auth: OAuth2Client) {
        await super.createGdElements(auth);
        try {
            //await OfferGdController.
        } catch (error) {
            console.log('Nie udało się utworzyć folderu oferty');
            await this.deleteController(auth);
        }
    }
}
