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
}
