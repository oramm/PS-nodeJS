import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import Setup from '../setup/Setup';

export default class ScrumBackup {
    private static getWeekNumber(d: Date): number {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(
            ((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7
        );
        return weekNo-1;
    }

    /**
     * Tworzy kopię zapasową pliku Scrum Sheet w dedykowanym folderze.
     * @param auth Uwierzytelniony klient OAuth2 (dostarczony przez gapiReguestHandler).
     */
    static async backupScrumSheet(auth: OAuth2Client): Promise<void> {
        console.log('Rozpoczynanie zadania tworzenia kopii zapasowej Scrum Sheet...');
        const drive = google.drive({ version: 'v3', auth });

        const originalFileId = Setup.ScrumSheet.GdId;
        const backupFolderId = '0B691lwYNjRcocFBtMW5lcE56TFk';

        if (!originalFileId || !backupFolderId) {
            console.error(
                'Błąd konfiguracji: Brak ID arkusza Scrum lub folderu kopii zapasowej.'
            );
            return;
        }

        const weekNumber = this.getWeekNumber(new Date());
        const backupFileName = `${weekNumber}. ENVI scrumboard`;

        try {
            await drive.files.copy({
                fileId: originalFileId,
                requestBody: {
                    name: backupFileName,
                    parents: [backupFolderId],
                },
            });
            console.log(
                `Pomyślnie utworzono kopię zapasową: ${backupFileName}`
            );
        } catch (error) {
            console.error(
                'Krytyczny błąd podczas tworzenia kopii zapasowej Scrum Sheet:',
                error
            );
        }
    }
}