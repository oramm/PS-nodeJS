import nodemailer from 'nodemailer';
import { drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';
import ToolsGd from './ToolsGd';
import Mail from 'nodemailer/lib/mailer';
import { PersonData } from '../types/types';
import { ImapFlow, SearchObject } from 'imapflow';
import Fuse from 'fuse.js';

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
            from: '"ERP ENVI" <erp@envi.com.pl.com>',
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

    static async searchEmails(
        searchText: string,
        searchFields: 'subject' | 'body' | 'from' | 'to' | 'all' = 'all',
        daysBefore?: number
    ) {
        const client = new ImapFlow({
            host: 'mail.envi.com.pl',
            port: 143,
            secure: false,
            auth: {
                user: 'biuro@envi.com.pl',
                pass: 'h576u7YkDTzMu7UanP4t',
            },
        });

        console.log('Wyszukiwanie wiadomości:', searchText, searchFields);
        const emails: Email[] = [];

        try {
            await client.connect();
            await client.mailboxOpen('INBOX');

            // Zbuduj kryteria wyszukiwania na podstawie podanych pól
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

            if (daysBefore && daysBefore > 0) {
                const dateThreshold = new Date();
                dateThreshold.setDate(dateThreshold.getDate() - daysBefore);
                criteria.since = dateThreshold.toISOString().split('T')[0];
            }

            console.log('Kryteria:', criteria);

            if (Object.keys(criteria).length === 0) {
                console.error(
                    'Brak kryteriów wyszukiwania. Kryteria nie zostały ustawione.'
                );
                return emails;
            }

            const messageUids = (await client.search(criteria)) || [];

            // Pobierz szczegóły każdej wiadomości
            for (const uid of messageUids) {
                const message = await client.fetchOne(uid.toString(), {
                    envelope: true,
                });
                if (message && message.envelope) {
                    emails.push({
                        uid,
                        subject: message.envelope.subject || '(bez tematu)',
                        from: message.envelope.from
                            ? message.envelope.from[0].address ||
                              '(bez nadawcy)'
                            : '(bez nadawcy)',
                        to: message.envelope.to
                            ? message.envelope.to
                                  .map((to) => to.address)
                                  .join(', ') || '(bez odbiorcy)'
                            : '(bez odbiorcy)',
                        date: message.envelope.date || new Date(),
                    });
                }
            }
        } catch (error) {
            console.error('Błąd podczas wyszukiwania wiadomości:', error);
        } finally {
            await client.logout();
        }

        return emails;
    }

    static async fuzzySearchEmails(searchText: string): Promise<Email[]> {
        const emails: Email[] = await this.searchEmails('', 'all', 7);

        try {
            console.log('-----Pobrane wiadomości:', emails.length);

            // Krok 3: Lokalnie wyszukaj fuzzy w pobranych wiadomościach
            const fuse = new Fuse(emails, {
                keys: ['subject', 'content'], // wyszukiwanie po temacie i treści
                threshold: 0.3, // tolerancja fuzzy
                includeScore: false,
                ignoreLocation: true,
            });

            const fuzzyResults = fuse.search(searchText);

            return fuzzyResults.map((result) => {
                const { uid, subject, from, to, date } = result.item;
                return { uid, subject, from, to, date };
            });
        } catch (error) {
            console.error('Błąd podczas wyszukiwania wiadomości:', error);
            return [];
        }
    }
}

interface Email {
    uid: string | number;
    subject: string;
    from: string;
    to: string;
    date: Date;
}
