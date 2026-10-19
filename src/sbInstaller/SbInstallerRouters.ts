import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { app } from '../index';
import SbAccessController from '../sbAccess/SbAccessController';
import {
    INSTALLER_FILE_NAME,
    buildInstallerZip,
    installerAssetsDir,
} from './SbInstallerPackage';

const INSTALLER_SCRIPT_NAME = 'ENVI-SB-instalator.cmd';

/** Wersja z linii `set "SB_INSTALATOR_WERSJA=..."` skryptu; brak pliku albo linii = null. */
function readSbInstallerVersion(): string | null {
    const script = path.join(installerAssetsDir(), INSTALLER_SCRIPT_NAME);
    if (!fs.existsSync(script)) return null;
    const match = /set "SB_INSTALATOR_WERSJA=([^"]+)"/.exec(fs.readFileSync(script, 'utf8'));
    return match ? match[1] : null;
}

/**
 * Pobieranie firmowego instalatora Second Brain.
 * Bramka przed trasami sprawdza rejestr dostępu przy każdym żądaniu: sama sesja nie wystarcza.
 */
app.use('/sbInstaller', async (req, res, next) => {
    try {
        if (!req.session?.userData) {
            res.status(401).send({ errorMessage: 'Użytkownik niezalogowany' });
            return;
        }
        if (!(await SbAccessController.canSeeSb(req.session.userData))) {
            res.status(403).send({
                errorMessage: 'Brak dostępu do Second Brain - poproś przełożonego o zaproszenie do SB w PS',
            });
            return;
        }
        next();
    } catch (error) {
        next(error);
    }
});

app.get('/sbInstaller/paczka', async (req: Request, res: Response, next) => {
    try {
        const user = req.session.userData;
        // Każde pobranie = nowy token urządzenia (SBD-2); poprzedni przestaje działać. Tokenu nie logujemy.
        const deviceToken = await SbAccessController.issueDeviceToken(user!.enviId);
        // Lasting trace of the download is now the ISSUE_TOKEN event in the SB history (SBD-2);
        // this log line stays as a quick look. Never add the token to it.
        console.log(
            `[SB-instalator] pobral: ${user?.userName} <${user?.systemEmail}> enviId=${user?.enviId} ${new Date().toISOString()}`,
        );
        res.attachment(INSTALLER_FILE_NAME);
        res.setHeader('Cache-Control', 'no-store');
        res.send(buildInstallerZip(deviceToken));
    } catch (error) {
        next(error);
    }
});

app.get('/sbInstaller/info', (req: Request, res: Response, next) => {
    try {
        res.setHeader('Cache-Control', 'no-cache');
        res.send({ version: readSbInstallerVersion() });
    } catch (error) {
        next(error);
    }
});
