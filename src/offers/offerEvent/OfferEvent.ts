import { drive_v3 } from 'googleapis';
import BusinessObject from '../../BussinesObject';
import { OfferData, OfferEventData, PersonData } from '../../types/types';
import { OAuth2Client } from 'google-auth-library';
import ToolsMail from '../../tools/ToolsMail';

/**
 * Przy odczytywaniu z bazy danych, jeśli w bazie danych jest zapisany JSON, to trzeba go przekonwertować na obiekt
 * Przy zapiswaniu do bazy danych, Repository przygotowuje dane (JSON stringify) przed zapisem
 */
export default class OfferEvent
    extends BusinessObject
    implements OfferEventData
{
    id?: number;
    offerId: number;
    _editor: PersonData;
    eventType: string;
    _lastUpdated?: string;
    comment?: string | null;
    additionalMessage?: string | null;
    versionNumber?: number | null;
    _recipients?: PersonData[] | null;
    recipientsJSON?: string | null | undefined;
    gdFilesJSON?: string | null | undefined;
    _gdFilesBasicData?: drive_v3.Schema$File[] | undefined;

    constructor(initParamObject: OfferEventData) {
        super({ ...initParamObject, _dbTableName: 'OfferEvents' });
        this._editor = initParamObject._editor;
        if (!initParamObject.offerId)
            throw new Error('Offer id is not defined');

        this.offerId = initParamObject.offerId;
        this.eventType = initParamObject.eventType;
        this._lastUpdated = initParamObject._lastUpdated;
        this.comment = initParamObject.comment || null;
        this.additionalMessage = initParamObject.additionalMessage || null;
        this.versionNumber = initParamObject.versionNumber || null;
        this.gdFilesJSON = initParamObject.gdFilesJSON || null;
        this._gdFilesBasicData =
            initParamObject._gdFilesBasicData ||
            (this.gdFilesJSON ? JSON.parse(this.gdFilesJSON) : undefined);
        this.recipientsJSON = initParamObject.recipientsJSON || null;
        this._recipients =
            initParamObject._recipients ||
            (this.recipientsJSON ? JSON.parse(this.recipientsJSON) : undefined);
    }

    /**
     * Wysyła email z ofertą do odbiorców
    /**
     * PUBLIC: Wywoływana przez OfferEventsController.sendMailWithOffer()
     *
     * REFAKTORING: Zmieniono typ z OurOffer na Offer (typ bazowy)
     * - Używamy tylko wspólnych właściwości (_type, _city, alias, description)
     * - Nie ma potrzeby importowania klasy pochodnej
     *
     * @param auth - OAuth2Client dla Google API
     * @param offer - Oferta (może być OurOffer lub ExternalOffer)
     * @param cc - Opcjonalne adresy CC
     */
    async sendMailWithOffer(
        auth: OAuth2Client,
        offer: OfferData,
        cc?: string[]
    ) {
        const _recipients = this._recipients;
        const gdFilesBasicData = this._gdFilesBasicData;
        if (!_recipients?.length)
            throw new Error('Nie podano odiorców maila z ofertą');
        if (!gdFilesBasicData?.length)
            throw new Error('Brak plików do wysłania');

        const subject = `Oferta: ${offer._type.name} ${offer._city.name} | ${offer.alias}`;
        let body = `<p>
                    Szanowni Państwo, <br>
                    W załączniku przesyłamy ofertę: ${offer.description}.
                </p>`;
        if (this.additionalMessage) body += `<p>${this.additionalMessage}</p>`;
        body += `<p>Proszę o potwierdzenie otrzymania oferty na adres: <a href="mailto:biuro@envi.com.pl">biuro@envi.com.pl</a>
                </p>
                <p>To jest automatyczna wiadomość, proszę nie odpowiadać na adres erp... </p>`;

        const html = `${body}`;

        await ToolsMail.sendEmailWithGdAttachments(auth, gdFilesBasicData, {
            to: ToolsMail.getMailListFromPersons(_recipients),
            cc: [...(cc || []), 'biuro@envi.com.pl'],
            subject,
            html,
            footer: ToolsMail.makeENVIFooter(),
        });
    }
}
