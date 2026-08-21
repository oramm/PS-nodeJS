import { Request, Response } from 'express';
import { app } from '../index';
import {
    INSTALLER_FILE_NAME,
    buildInstallerZip,
} from './SbInstallerPackage';

/**
 * Hand-out point for the company Second Brain installer (decision D-7 of the SB release pack).
 *
 * NO AUTHORISATION CODE HERE ON PURPOSE. requireSession already refuses every route that is not
 * on its explicit public list, and this route is deliberately not on it; a second, private check
 * would be a second thing to keep in step with the first.
 */
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
