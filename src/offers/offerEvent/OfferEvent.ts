import { drive_v3 } from 'googleapis';
import BusinessObject from '../../BussinesObject';
import { OfferEventData, PersonData } from '../../types/types';
import { OAuth2Client } from 'google-auth-library';
import OurOffer from '../OurOffer';
import ToolsMail from '../../tools/ToolsMail';
import ToolsDb from '../../tools/ToolsDb';
import OfferEventsController from './OfferEventsController';
import Setup from '../../setup/Setup';
import { PoolConnection } from 'mysql2/promise';

/**
 * Przy odczytywaniu z bazy danych, jeśli w bazie danych jest zapisany JSON, to trzeba go przekonwertować na obiekt
 * Przy zapiswaniu do bazy danych, jeśli zapisywany obiekt ma pole, które jest obiektem, to trzeba je przekonwertować na JSON
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

    async addNewController() {
        try {
            const conn = await ToolsDb.getPoolConnectionWithTimeout();
            const previousEvents = OfferEventsController.getOfferEventsList([
                { offerId: this.offerId, eventType: Setup.OfferEventType.SEND },
            ]);
            this.versionNumber =
                (await previousEvents).filter(
                    (event) => event.eventType === Setup.OfferEventType.SEND
                ).length + 1;
            console.group('Creating new OfferEvent');
            await this.addInDb();
            console.log('OfferEvent added to db');
            console.groupEnd();
        } catch (err) {
            this.deleteController();
            throw err;
        }
    }

    /** przed zapisem do bazy danych trzeba konwertuje obiekty na JSON */
    async addInDb(
        externalConn?: PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        this.gdFilesJSON = JSON.stringify(this._gdFilesBasicData);
        this.recipientsJSON = JSON.stringify(this._recipients);
        await super.addInDb(externalConn, isPartOfTransaction);
    }

    async editController() {
        try {
            console.group('Editing OfferEvent');
            await this.editInDb();
            console.log('OfferEvent edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('OfferEvent edit error');
            throw err;
        }
    }

    async deleteController() {
        if (!this.id) throw new Error('No offerEvent id');
        await this.deleteFromDb();
    }

    sendMailWithOffer(auth: OAuth2Client, offer: OurOffer, cc?: string[]) {
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
        body += `<p>
                Proszę o potwierdzenie otrzymania oferty na adres: <a href="mailto:biuro@envi.com.pl">biuro@envi.com.pl</a>
                </p>`;

        const html = `${body}`;
        ToolsMail.sendEmailWithGdAttachments(auth, gdFilesBasicData, {
            to: ToolsMail.getMailListFromPersons(_recipients),
            cc:
                cc ||
                [
                    //'monika.tymczyszyn@envi.com.pl',
                    //'marek@envi.com.pl',
                    //'stecula@op.pl',
                ],
            subject,
            html,
            footer: ToolsMail.makeENVIFooter(),
        });
    }
}
