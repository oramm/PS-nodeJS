import ToolsGd from '../tools/ToolsGd';
import { ExternalOfferData } from '../types/types';
import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';

export default class ExternalOffer extends Offer implements ExternalOfferData {
    constructor(initParamObject: ExternalOfferData) {
        super(initParamObject);
    }

    async createGdElements(auth: OAuth2Client) {
        await super.createGdElements(auth);
        if (!this.gdFolderId) throw new Error('Brak folderu oferty');
        try {
            console.log('Tworzenie podfolderów');
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
