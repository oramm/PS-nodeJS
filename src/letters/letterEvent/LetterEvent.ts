import { drive_v3 } from 'googleapis';
import BusinessObject from '../../BussinesObject';
import {
    LetterEventData,
    PersonData,
    OurLetterContractData,
} from '../../types/types';
import { OAuth2Client } from 'google-auth-library';
import ToolsMail from '../../tools/ToolsMail';

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

    /**
     * Waliduje dane potrzebne do wysłania email
     * HELPER: Metoda biznesowa bez operacji I/O
     * @throws Error jeśli brak recipients lub gdFiles
     */
    validateEmailData(): void {
        if (!this._recipients?.length)
            throw new Error('Nie podano odbiorców maila z ofertą');
        if (!this._gdFilesBasicData?.length)
            throw new Error('Brak plików do wysłania');
    }

    /**
     * Buduje treść email na podstawie danych letter
     * HELPER: Metoda biznesowa bez operacji I/O
     * @param letter - dane pisma
     * @returns obiekt z subject i html
     */
    buildEmailContent(letter: OurLetterContractData): {
        subject: string;
        html: string;
    } {
        const subject = `Pismo nr ${letter.number} - ${letter.description}`;

        let body = `<p>
                    Szanowni Państwo, <br>
                    W załączniku przesyłamy pismo dotyczące: ${letter.description}.
                </p>`;

        if (this.additionalMessage) {
            body += `<p>${this.additionalMessage}</p>`;
        }

        body += `<p>
                Proszę o potwierdzenie otrzymania pisma na adres: <a href="mailto:biuro@envi.com.pl">biuro@envi.com.pl</a>
                </p>`;

        return { subject, html: body };
    }
}
