import { ExternalOfferData, OfferBondData } from '../types/types';
import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';
import OfferBond from './OfferBond/OfferBond';
import ToolsGd from '../tools/ToolsGd';

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

    /**zwraca folder "Oferta" z plikami oferty
     * @param auth - obiekt autoryzacji
     * @param offerPreparationFolderGdId - id folderu "01 Przygotowanie oferty"
     */
    async getOfferFilesFolderData(
        auth: OAuth2Client,
        offerPreparationFolderGdId: string
    ) {
        const offerFilesFolderData = await ToolsGd.getFileMetaDataByName(auth, {
            parentId: offerPreparationFolderGdId,
            fileName: 'Oferta',
        });
        if (!offerFilesFolderData || !offerFilesFolderData.id)
            throw new Error('Brak folderu "Oferta"');
        return offerFilesFolderData;
    }
}
