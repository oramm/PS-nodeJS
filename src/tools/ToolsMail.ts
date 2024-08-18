import nodemailer from 'nodemailer';
import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';

export default class ToolsMail {
    // Tworzenie wspólnego transportera dla Nodemailer
    static createTransporter() {
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
        params: nodemailer.SendMailOptions & { text?: string; html?: string }
    ) {
        const { to, subject, text, html, attachments } = params;
        const transporter = this.createTransporter();

        const mailOptions: nodemailer.SendMailOptions = {
            from: '"ERP ENVI" <erp@envi.com.pl.com>',
            to,
            cc: '',
            subject,
            html: this.makeHtmlBody(text, html),
            text: this.makeTextBody(text),
            attachments,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log('Wiadomość wysłana: %s', info.messageId);
        } catch (error) {
            console.error('Błąd przy wysyłaniu maila:', error);
        }
    }

    private static makeTextBody(text: string | undefined) {
        return `${text}\n\n---\nWiadomość została wysłana automatycznie z systemu ERP ENVI. Prosimy nie odpowiadać na tę wiadomość.`;
    }

    private static makeHtmlBody(text: string = '', html?: string) {
        if (!html && !text) throw new Error('Brak treści maila');
        const footer = `
            <br><br>
            ---
            <p>
            Ten mail jest poufny i przeznaczony tylko dla użytkowników systemu ERP ENVI. <BR>
            Wiadomość została wysłana automatycznie z systemu ERP ENVI. Proszę nie odpowiadaj na tę wiadomość. <BR>
            Możesz napisać na grupie Skype "Witryna ENVI, ERP"
            </p>
            <a href="https://ps.envi.com.pl/React/">Odwiedź nasz system ERP</a>
        `;
        if (html) return `${html} ${footer}`;
        return `<p>${text.replace(/\n/g, '</p>')} ${footer}`;
    }

    // Wysyłanie maila z załącznikiem z Google Drive
    static async sendMailWithAttachment(
        to: string | string[],
        subject: string,
        text: string,
        fileId: string,
        auth: OAuth2Client
    ) {
        // Pobierz strumień pliku z Google Drive
        const fileStream = await this.getFileStreamFromGoogleDrive(
            fileId,
            auth
        );

        // Wysyłanie maila z załącznikiem
        return this.sendMail({
            to,
            subject,
            text,
            attachments: [
                {
                    filename: 'attachment.ext', // Zmień na odpowiednią nazwę pliku
                    content: fileStream,
                },
            ],
        });
    }

    // Pobieranie strumienia pliku z Google Drive
    static async getFileStreamFromGoogleDrive(
        fileId: string,
        auth: OAuth2Client
    ): Promise<Readable> {
        const drive = google.drive({ version: 'v3', auth });
        const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        return res.data as Readable;
    }
}
