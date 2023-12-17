import ToolsGd from '../tools/ToolsGd';
import Offer, { OfferInitParams } from './Offer';
import { OAuth2Client } from 'google-auth-library';

export default class OtherOffer extends Offer {
    constructor(initParamObject: OfferInitParams) {
        super(initParamObject);
    }

    async createGdElements(auth: OAuth2Client) {
        await super.createGdElements(auth);
        try {
            ToolsGd.setFolder(auth, {
                parentId: this.gdFolderId,
                name: 'SWZ',
            });
            ToolsGd.setFolder(auth, {
                parentId: this.gdFolderId,
                name: 'Oferta',
            });
        } catch (error) {
            console.log('Nie udało się utworzyć folderu SWZ');
            await this.deleteController(auth);
        }
    }
}
