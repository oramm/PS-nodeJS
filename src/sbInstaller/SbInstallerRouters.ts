import { Request, Response } from 'express';
import { app } from '../index';
import SbAccessController from '../sbAccess/SbAccessController';
import {
    INSTALLER_FILE_NAME,
    buildInstallerZip,
} from './SbInstallerPackage';

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

app.get('/sbInstaller/paczka', (req: Request, res: Response, next) => {
    try {
        const user = req.session.userData;
        // ponytail: the trace is a log line, not a table - a dozen downloads in the lifetime of
        // this route do not earn a migration in the ERP. Ceiling: Heroku keeps roughly a week of
        // logs, so this answers "who took it recently", not "who ever took it". If a lasting
        // register is wanted, that is a table plus a screen, and it should be added then.
        console.log(
            `[SB-instalator] pobral: ${user?.userName} <${user?.systemEmail}> enviId=${user?.enviId} ${new Date().toISOString()}`,
        );
        res.attachment(INSTALLER_FILE_NAME);
        res.send(buildInstallerZip());
    } catch (error) {
        next(error);
    }
});
