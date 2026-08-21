import AdmZip from 'adm-zip';
import path from 'path';

/**
 * WHY THIS EXISTS. A new employee cannot install the company Second Brain today without already
 * having access to the shared Google Drive that the installer configures. PS ENVI is the one
 * system everybody has on day one, so the installer is handed out from behind its session gate
 * (decision D-7 in the SB pack). This file only builds the archive; the gate is requireSession.
 *
 * WHY A ZIP AND NOT bootstrap.cmd ALONE. `bootstrap.cmd` runs `%~dp0bootstrap.ps1`, i.e. the
 * script sitting NEXT TO IT. Serving the .cmd on its own would hand someone a launcher with
 * nothing to launch. A second route for the .ps1 is not an option either: the file is fetched by
 * a double-click on the user's machine, which carries no browser session, so it would have to be
 * public.
 *
 * SOURCE OF TRUTH. The payload under assets/sb-installer is a copy; it is maintained in
 * envi-konsulting/ENVI.SB.Rdzen (bootstrap/). See assets/sb-installer/ZRODLO.md.
 */
export const INSTALLER_FILE_NAME = 'ENVI-SB-instalator.zip';

/** In order of usefulness to whoever unpacks it: the thing to double-click comes first. */
export const INSTALLER_ENTRIES = [
    'bootstrap.cmd',
    'bootstrap.ps1',
    'README-onboarding.md',
];

// Resolved from the process working directory, the way loadEnv already resolves .env — `tsc`
// copies no assets, so a path relative to this module would point into build/ in production and
// find nothing there.
export const installerAssetsDir = () =>
    path.resolve(process.cwd(), 'assets', 'sb-installer');

export function buildInstallerZip(): Buffer {
    const dir = installerAssetsDir();
    const zip = new AdmZip();
    for (const entry of INSTALLER_ENTRIES)
        zip.addLocalFile(path.join(dir, entry));
    return zip.toBuffer();
}
