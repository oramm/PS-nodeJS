import AdmZip from 'adm-zip';
import path from 'path';

/**
 * WHY THIS EXISTS. A new employee cannot install the company Second Brain today without already
 * having access to the shared Google Drive that the installer configures. PS ENVI is the one
 * system everybody has on day one, so the installer is handed out from behind its session gate
 * (decision D-7 in the SB pack). This file only builds the archive; the gate is requireSession.
 *
 * WHY A ZIP AROUND ONE FILE. The installer is a single self-extracting ENVI-SB-instalator.cmd
 * (the script travels inside it), so the ZIP carries nothing else. It is still a ZIP because
 * Edge stops a downloaded .cmd with "may harm your device", while the same file inside a ZIP went
 * through Chrome and Edge without a warning and runs by double-click straight from the opened
 * archive (measured 2026-09-30, decision D-J1 = C1 in the SB pack). Serving the bare .cmd would
 * bring that warning back.
 *
 * SOURCE OF TRUTH. The file under assets/sb-installer is built, not copied, from
 * envi-konsulting/ENVI.SB.Rdzen (bootstrap/). See assets/sb-installer/ZRODLO.md.
 */
export const INSTALLER_FILE_NAME = 'ENVI-SB-instalator.zip';

export const INSTALLER_ENTRIES = ['ENVI-SB-instalator.cmd'];

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
