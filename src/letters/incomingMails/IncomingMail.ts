import BusinessObject from '../../BussinesObject';
import { IncomingMailData, PersonData } from '../../types/types';

/**
 * Koperta pisma przychodzącego: wiadomość ze skrzynki jako rekord w systemie.
 *
 * Tożsamością wiadomości jest RFC `Message-ID` (kolumna `MessageId`, UNIQUE) — powtórzony skan
 * skrzynki odbija się o duplikat klucza i nie zakłada drugiej koperty. UID IMAP na klucz się nie
 * nadaje: jest per-folder i zmienia się przy przeniesieniu wiadomości.
 */
export default class IncomingMail
    extends BusinessObject
    implements IncomingMailData
{
    id?: number;
    messageId: string;
    account: string;
    subject: string;
    body: string;
    from: string;
    to: string;
    date: string;
    editorId?: number;
    _editor?: PersonData;
    _lastUpdated?: string;
    _lettersCount?: number;

    constructor(initParamObject: IncomingMailData) {
        super({ ...initParamObject, _dbTableName: 'IncomingMails' });

        if (!initParamObject.messageId)
            throw new Error(
                'messageId (RFC Message-ID) jest wymagany dla IncomingMail'
            );
        if (!initParamObject.account)
            throw new Error('account (skrzynka) jest wymagany dla IncomingMail');

        this.messageId = initParamObject.messageId;
        this.account = initParamObject.account;
        this.subject = initParamObject.subject ?? '';
        this.body = initParamObject.body ?? '';
        this.from = initParamObject.from ?? '';
        this.to = initParamObject.to ?? '';
        this.date = IncomingMail.toSqlDateTime(initParamObject.date);
        // BusinessObject wyprowadza editorId z _editor; przy odczycie z bazy _editor nie ma,
        // a EditorId jest w wierszu — bez tego autor koperty ginie przy mapowaniu.
        if (!this.editorId && initParamObject.editorId)
            this.editorId = initParamObject.editorId;
        this._lastUpdated = initParamObject._lastUpdated;
        this._lettersCount = initParamObject._lettersCount;
    }

    /**
     * Data wiadomości musi wejść do bazy jako 'YYYY-MM-DD HH:MM:SS'.
     * `sql_mode` jest pusty (jak na produkcji), więc data w innym kształcie nie wywołałaby błędu,
     * tylko cicho zapisała `0000-00-00 00:00:00`.
     */
    static toSqlDateTime(value: string | Date): string {
        // Napis bez strefy bierzemy dosłownie. `new Date('2026-07-31 09:15:00')` uznaje go za czas
        // lokalny maszyny i po konwersji do UTC przesuwa godzinę o offset — data w bazie różniłaby
        // się od tej, którą podał wywołujący, i nikt by tego nie zauważył.
        if (typeof value === 'string') {
            const zoneless = value
                .trim()
                .match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/);
            if (zoneless)
                return `${zoneless[1]} ${zoneless[2]}${zoneless[3] ?? ':00'}`;
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime()))
            throw new Error(`Nieczytelna data wiadomości: ${String(value)}`);
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }
}
