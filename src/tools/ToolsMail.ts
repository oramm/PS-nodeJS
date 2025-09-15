import nodemailer from 'nodemailer';
import { drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';
import ToolsGd from './ToolsGd';
import Mail from 'nodemailer/lib/mailer';
import { MailData, PersonData } from '../types/types';
import { FetchMessageObject, ImapFlow, SearchObject } from 'imapflow';
import Fuse from 'fuse.js';
import Setup from '../setup/Setup';
import { simpleParser } from 'mailparser';
import { Request } from 'express';

export default class ToolsMail {
    // Tworzenie wspólnego transportera dla Nodemailer
    static createTransporter() {
        if (
            !process.env.SMTP_HOST ||
            !process.env.SMTP_USER ||
            !process.env.SMTP_PASSWORD
        ) {
            throw new Error(
                'Brak wymaganego ustawienia SMTP w zmiennych środowiskowych'
            );
        }
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: false, // Możesz zmienić na true, jeśli używasz portu 465
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });
    }

    static async sendMail(
        params: nodemailer.SendMailOptions & {
            text?: string;
            html?: string;
            footer?: string;
        }
    ) {
        let { to, cc, subject, text, html, attachments, footer } = params;
        const transporter = this.createTransporter();
        if (!footer) footer = this.makeERPFooter();
        const mailOptions: nodemailer.SendMailOptions = {
            from: '"ERP ENVI" <erp@envi.com.pl>',
            to,
            cc,
            subject,
            html: this.makeHtmlBody(text, html, footer),
            text: this.makeTextBody(text),
            attachments,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log('Wiadomość wysłana: %s', info.messageId);
        } catch (error) {
            console.error('Błąd przy wysyłaniu maila:', error);
            throw error;
        }
    }

    private static makeTextBody(text: string | undefined) {
        return `${text}\n\n---\nWiadomość została wysłana automatycznie z systemu ERP ENVI. Prosimy nie odpowiadać na tę wiadomość.`;
    }

    private static makeHtmlBody(
        text: string = '',
        html: string = '',
        footer?: string
    ) {
        if (!html && !text) throw new Error('Brak treści maila');

        if (html) return `${html} ${footer}`;
        return `<p>${text.replace(/\n/g, '</p>')} ${footer}`;
    }

    private static makeERPFooter() {
        return `
            <br><br>
            ---
            <p>
            Ten mail jest poufny i przeznaczony tylko dla użytkowników systemu ERP ENVI. <BR>
            Wiadomość została wysłana automatycznie z systemu ERP ENVI. Proszę nie odpowiadaj na tę wiadomość. <BR>
            Możesz napisać na grupie Skype "Witryna ENVI, ERP"
            </p>
            <a href="https://ps.envi.com.pl/React/">Odwiedź nasz system ERP</a>
        `;
    }

    static makeENVIFooter() {
        return `
            <br><br>
            _________________
            <p>
            Envi Konsulting<BR>
            e-mail: <a href="mailto:biuro@envi.com.pl">biuro@envi.com.pl</a><BR>
            <a href="https://envi.com.pl">envi.com.pl</a> | <a href="http://fidman.eu">FIDman</a> | <a href="http://www.e-aquamatic.pl/">e-Aquamatic</a><BR>
            ul. Brzechwy 3<BR>
            49-305 Brzeg<BR>
            NIP: 747-191-75-75<BR>
            REGON: 386527768 <BR>
            </p>
            <p>
            Ten mail jest poufny i przeznaczony tylko dla odbiorców. <BR>
            Wiadomość została wysłana automatycznie z systemu ERP ENVI. Proszę nie odpowiadaj na tę wiadomość. Prosimy o kontakt pod adresem mailowym wskazanym powyżej w wiadomości.<BR>
            </p>
            
        `;
    }

    // Wysyłanie maila z załącznikiem z Google Drive
    static async sendEmailWithGdAttachments(
        auth: OAuth2Client,
        gdFilesBasicData: drive_v3.Schema$File[],
        params: nodemailer.SendMailOptions & {
            text?: string;
            html?: string;
            footer: string;
        }
    ) {
        const { to, cc, subject, text, html, footer } = params;
        console.log(
            'pobieranie plików z Google Drive na potstawie id:',
            gdFilesBasicData
        );
        const filesData = await ToolsGd.getFileStreamWithMetaDataFromGd(
            gdFilesBasicData,
            auth
        );

        return this.sendMail({
            to,
            cc,
            subject,
            html,
            text,
            attachments: await this.convertGdFilesDataToMailAttachments(
                filesData
            ),
            footer,
        });
    }

    protected static async convertGdFilesDataToMailAttachments(
        filesData: {
            stream: Readable;
            metadata: drive_v3.Schema$File;
        }[]
    ) {
        const attachments: Mail.Attachment[] = [];
        for (const fileData of filesData) {
            if (!fileData.metadata.name)
                throw new Error('Brak nazwy pliku załącznika');
            attachments.push({
                filename: fileData.metadata.name,
                content: fileData.stream,
                contentType: fileData.metadata.mimeType || undefined,
            });
        }
        return attachments;
    }

    static getMailListFromPersons(persons: PersonData[]) {
        return persons.map((person) => person.email).join(', ');
    }

    static async getEmailDetails(uid: number) {
        const client = new ImapFlow(Setup.biuroImapMailClient);
        try {
            await client.connect();
            await client.mailboxOpen('INBOX');
            const message = await client.fetchOne(uid.toString(), {
                envelope: true,
                source: true,
                flags: true,
            });
            if (message && typeof message !== 'boolean') {
                console.log('Pobrano szczegóły maila: flagi', message.flags);
                return {
                    id: uid,
                    uid: uid,
                    subject: message.envelope?.subject || '(bez tematu)',
                    from: message.envelope?.from
                        ? message.envelope.from[0]?.address || '(bez nadawcy)'
                        : '(bez nadawcy)',
                    to: message.envelope?.to
                        ? message.envelope.to
                              .map((to: any) => to.address)
                              .join(', ') || '(bez odbiorcy)'
                        : '(bez odbiorcy)',
                    date: this.parseDate(message.envelope?.date || new Date()),
                    flags: message.flags,
                    body: await this.decodeMailBody(message),
                } as MailData;
            }
        } catch (error) {
            console.error('Błąd podczas pobierania szczegółów maila:', error);
        } finally {
            client.logout();
        }
    }

    static async searchEmails(
        conditions: MailsSearchParams,
        searchFields: 'subject' | 'body' | 'from' | 'to' | 'all' = 'all'
    ) {
        let { searchText, incomingDateFrom, incomingDateTo } = conditions;

        console.log('Wyszukiwanie wiadomości:', searchText, searchFields);
        const emails: MailData[] = [];
        const client = new ImapFlow(Setup.biuroImapMailClient);
        try {
            await client.connect();
            await client.mailboxOpen('INBOX');
            console.log('Połączono z serwerem IMAP, szukanie wiadomości...');
            // Zbuduj kryteria wyszukiwania na podstawie podanych pól
            const criteria: SearchObject = ToolsMail.makeSearchCriteria(
                '',
                searchFields,
                incomingDateFrom,
                incomingDateTo
            );

            if (Object.keys(criteria).length === 0) {
                console.error(
                    'Brak kryteriów wyszukiwania. Kryteria nie zostały ustawione.'
                );
                return emails;
            }

            const messageUids = (await client.search(criteria)) || [];
            console.log('Znaleziono wiadomości:', messageUids.length);
            // Pobierz szczegóły każdej wiadomości
            for (const uid of messageUids) {
                const message = await client.fetchOne(uid.toString(), {
                    envelope: true,
                    source: false,
                    flags: false,
                });
                if (
                    message &&
                    typeof message !== 'boolean' &&
                    message.envelope
                ) {
                    emails.push({
                        uid,
                        subject: message.envelope?.subject || '(bez tematu)',
                        from: message.envelope?.from
                            ? message.envelope.from[0]?.address ||
                              '(bez nadawcy)'
                            : '(bez nadawcy)',
                        to: message.envelope?.to
                            ? message.envelope.to
                                  .map((to: any) => to.address)
                                  .join(', ') || '(bez odbiorcy)'
                            : '(bez odbiorcy)',
                        date: this.parseDate(
                            message.envelope?.date || new Date()
                        ),
                    });
                }
            }

            console.log('Przetworzono wiadomości:', emails.length);
        } catch (error) {
            console.error('Błąd podczas wyszukiwania wiadomości:', error);
        } finally {
            await client.logout();
        }

        return emails;
    }

    private static parseDate(date: Date | string) {
        if (typeof date === 'string') {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) {
                date = parsedDate.toISOString();
            } else {
                console.warn(`Nieprawidłowa wartość daty: ${date}`);
                date = new Date().toISOString(); // Możesz ustawić wartość domyślną, jeśli chcesz
            }
        } else if (date instanceof Date) {
            date = date.toISOString();
        }
        return date;
    }

    private static makeSearchCriteria(
        searchText: string | undefined,
        searchFields: string,
        incomingDateFrom: string | undefined,
        incomingDateTo: string | undefined
    ) {
        let criteria: SearchObject = {};

        if (searchText) {
            switch (searchFields) {
                case 'subject':
                    criteria = { header: { subject: searchText } };
                    break;
                case 'body':
                    criteria = { body: searchText };
                    break;
                case 'from':
                    criteria = { header: { from: searchText } };
                    break;
                case 'to':
                    criteria = { header: { to: searchText } };
                    break;
                case 'all':
                    criteria = {
                        or: [
                            { header: { subject: searchText } },
                            { body: searchText },
                            { header: { from: searchText } },
                            { header: { to: searchText } },
                        ],
                    };
                    break;
            }
        }

        if (incomingDateFrom) {
            criteria.since = new Date(incomingDateFrom);
        }
        if (incomingDateTo) {
            criteria.before = new Date(incomingDateTo);
        }

        console.log('Kryteria:', criteria);
        return criteria;
    }

    private static async decodeMailBody(message: FetchMessageObject) {
        if (!message.source) {
            return 'Brak treści wiadomości';
        }
        const rawEmail = message.source.toString('utf-8');

        try {
            // Parsowanie wiadomości za pomocą mailparser
            const parsedMessage = await simpleParser(rawEmail);

            // Preferuj treść text/plain, jeśli istnieje, w przeciwnym razie text/html
            return (
                parsedMessage.text ||
                parsedMessage.html ||
                'Nie znaleziono treści text/plain ani text/html'
            );
        } catch (error) {
            console.error('Błąd podczas parsowania wiadomości:', error);
            return 'Błąd podczas przetwarzania wiadomości';
        }
    }

    static async fuzzySearchEmails(
        orConditions: MailsSearchParams
    ): Promise<MailData[]> {
        const emails: MailData[] = await this.searchEmails(orConditions, 'all');
        if (!emails || emails.length === 0) return [];

        emails.forEach((email) => {
            email.id = email.uid;
        });

        if (!orConditions.searchText) return emails;
        try {
            // Krok 3: Lokalnie wyszukaj fuzzy w pobranych wiadomościach
            const fuse = new Fuse(emails, {
                keys: ['subject', 'body'], // wyszukiwanie po temacie i treści
                threshold: 0.3, // tolerancja fuzzy
                includeScore: false,
                ignoreLocation: true,
            });

            const fuzzyResults = fuse.search(orConditions.searchText);
            console.log('Wiadomości po fuzzysearch:', fuzzyResults.length);
            return fuzzyResults.map((result) => result.item);
        } catch (error) {
            console.error('Błąd podczas wyszukiwania wiadomości:', error);
            throw error;
        }
    }

    static async deleteMail(uid: string): Promise<void> {
        const client = new ImapFlow(Setup.biuroImapMailClient);
        try {
            await client.connect();
            await client.mailboxOpen('INBOX');

            await client.messageDelete(uid);

            console.log(`Wiadomość o UID: ${uid} została usunięta`);
        } catch (error) {
            console.error('Błąd podczas usuwania wiadomości:', error);
        } finally {
            await client.logout();
        }
    }

    private static escapeHtml(str: string) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    static async sendServerErrorReport(error: unknown, req?: Request) {
        const to = process.env.PS_ADMIN_MAIL!;
        const now = new Date().toISOString();
        const errorText =
            typeof error === 'string'
                ? this.escapeHtml(error)
                : error instanceof Error
                ? this.escapeHtml(`${error.message}\n\n${error.stack}`)
                : this.escapeHtml(JSON.stringify(error, null, 2));

        const subject = `[ERP ENVI] Błąd serwera${
            req ? ` ${req.method} ${req.originalUrl}` : ''
        }`;

        let requestInfoHtml = '';
        if (req) {
            const sessionJson = this.escapeHtml(
                JSON.stringify(req.session, null, 2)
            );
            const bodyJson = this.escapeHtml(
                JSON.stringify(req.parsedBody ?? req.body, null, 2)
            );
            const queryJson = this.escapeHtml(
                JSON.stringify(req.parsedQuery ?? req.query, null, 2)
            );
            requestInfoHtml = `
            <h5>Informacje o żądaniu:</h5>
            <ul>
              <li><strong>Metoda:</strong> ${req.method}</li>
              <li><strong>URL:</strong> ${req.originalUrl}</li>
              <li><strong>IP:</strong> ${req.ip}</li>
              <li><strong>Data:</strong> ${now}</li>
              <li><strong>Użytkownik:</strong> ${
                  req.session?.userData?.systemEmail || 'Brak'
              }</li>
            </ul>
            <h5>Sesja:</h5>
            <pre><code>${sessionJson}</code></pre>
            <h5>Body:</h5>
            <pre><code>${bodyJson}</code></pre>
            <h5>Query:</h5>
            <pre><code>${queryJson}</code></pre>
        `;
        }

        const html = `
        <h5>Szczegóły błędu:</h5>
        <pre><code>${errorText}</code></pre>
        ${requestInfoHtml}
    `;

        try {
            await this.sendMail({
                to,
                subject,
                html,
                footer: this.makeENVIFooter(),
            });
            console.log('Raport błędu serwera został wysłany na adres:', to);
        } catch (mailError) {
            console.error(
                'Nie udało się wysłać raportu błędu przez e-mail:',
                mailError
            );
        }
    }
    static async sendClientErrorReport(req: Request) {
        const to = process.env.PS_ADMIN_MAIL!;
        const now = new Date().toISOString();
        const error = req.body.error;
        const errorText =
            typeof error === 'string'
                ? this.escapeHtml(error)
                : error instanceof Error
                ? this.escapeHtml(`${error.message}\n\n${error.stack}`)
                : this.escapeHtml(JSON.stringify(error, null, 2));

        // Pobierz userData z sesji, jeśli dostępne
        const userData = req.session?.userData;
        const userEmail = userData?.systemEmail;

        const subject = `[ERP ENVI] Błąd klienta${
            req.body.url ? ` na ${req.body.url}` : ''
        }`;

        const additionalDataJson = req.body.additionalData
            ? this.escapeHtml(JSON.stringify(req.body.additionalData, null, 2))
            : 'Brak';

        const clientInfoHtml = `
            <h5>Informacje o kliencie:</h5>
            <ul>
              <li><strong>URL:</strong> ${req.body.url || 'Brak'}</li>
              <li><strong>User Agent:</strong> ${
                  req.headers['user-agent'] || 'Brak'
              }</li>
              <li><strong>Data błędu:</strong> ${req.body.timestamp || now}</li>
              <li><strong>Email użytkownika:</strong> ${
                  userEmail || 'Brak'
              }</li>
            </ul>
            <h5>Dodatkowe dane:</h5>
            <pre><code>${additionalDataJson}</code></pre>
        `;

        const html = `
        <h5>Szczegóły błędu klienta:</h5>
        <pre><code>${errorText}</code></pre>
        ${clientInfoHtml}
    `;

        try {
            await this.sendMail({
                to,
                subject,
                html,
                footer: this.makeENVIFooter(),
            });
            console.log('Raport błędu klienta został wysłany na adres:', to);
        } catch (mailError) {
            console.error(
                'Nie udało się wysłać raportu błędu klienta przez e-mail:',
                mailError
            );
        }
    }
}

export type MailsSearchParams = {
    searchText?: string;
    incomingDateFrom?: string;
    incomingDateTo?: string;
};
