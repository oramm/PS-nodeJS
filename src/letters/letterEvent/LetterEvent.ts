import { drive_v3 } from 'googleapis';
import BusinessObject from '../../BussinesObject';
import { LetterEventData, PersonData } from '../../types/types';
import { OAuth2Client } from 'google-auth-library';
import ToolsMail from '../../tools/ToolsMail';
import LetterEventsController from './LetterEventsController';
import Setup from '../../setup/Setup';
import { PoolConnection } from 'mysql2/promise';
import OurLetterContract from '../OurLetterContract';

/**
 * Przy odczytywaniu z bazy danych, jeśli w bazie danych jest zapisany JSON, to trzeba go przekonwertować na obiekt
 * Przy zapiswaniu do bazy danych, jeśli zapisywany obiekt ma pole, które jest obiektem, to trzeba je przekonwertować na JSON
 */
export default class LetterEvent
    extends BusinessObject
    implements LetterEventData
{
    id?: number;
    letterId: number;
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

    constructor(initParamObject: LetterEventData) {
        super({ ...initParamObject, _dbTableName: 'LetterEvents' });
        this._editor = initParamObject._editor;
        if (!initParamObject.letterId)
            throw new Error('Letter id is not defined');

        this.letterId = initParamObject.letterId;
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
            const previousEvents = LetterEventsController.getLetterEventsList([
                {
                    letterId: this.letterId,
                    eventType: Setup.LetterEventType.SENT,
                },
            ]);
            this.versionNumber =
                (await previousEvents).filter(
                    (event) => event.eventType === Setup.LetterEventType.SENT
                ).length + 1;
            console.group('Creating new LetterEvent');
            await this.addInDb();
            console.log('LetterEvent added to db');
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
            console.group('Editing LetterEvent');
            await this.editInDb();
            console.log('LetterEvent edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('LetterEvent edit error');
            throw err;
        }
    }

    async deleteController() {
        if (!this.id) throw new Error('No offerEvent id');
        await this.deleteFromDb();
    }

    sendMailWithLetter(
        auth: OAuth2Client,
        letter: OurLetterContract,
        cc?: string[]
    ) {
        const _recipients = this._recipients;
        const gdFilesBasicData = this._gdFilesBasicData;
        if (!_recipients?.length)
            throw new Error('Nie podano odiorców maila z ofertą');
        if (!gdFilesBasicData?.length)
            throw new Error('Brak plików do wysłania');

        const subject = `Pismo nr ${letter.number} - ${letter.description}`;
        let body = `<p>
                    Szanowni Państwo, <br>
                    W załączniku przesyłamy pismo dotyczącę: ${letter.description}.
                </p>`;
        if (this.additionalMessage) body += `<p>${this.additionalMessage}</p>`;
        body += `<p>
                Proszę o potwierdzenie otrzymania pisma na adres: <a href="mailto:biuro@envi.com.pl">biuro@envi.com.pl</a>
                </p>`;

        const html = `${body}`;
        ToolsMail.sendEmailWithGdAttachments(auth, gdFilesBasicData, {
            to: ToolsMail.getMailListFromPersons(_recipients),
            cc: [...(cc || []), 'biuro@envi.com.pl'],
            subject,
            html,
            footer: ToolsMail.makeENVIFooter(),
        });
    }
}
