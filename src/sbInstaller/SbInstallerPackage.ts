import AdmZip from 'adm-zip';
import fs from 'fs';
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

/** Linia skryptu, za którą wstawiamy token urządzenia (zmienna środowiska dla bootstrap.ps1). */
const VERSION_LINE = /^set "SB_INSTALATOR_WERSJA=[^"]*"\r?\n/m;
export const DEVICE_TOKEN_VARIABLE = 'SB_TOKEN_URZADZENIA';

/**
 * Wstawia token urządzenia osoby (SBD-2) do nagłówka skryptu: instalator nie ma przeglądarki,
 * więc tym tokenem wchodzi do PS po klucz i hasła. Plik niesie binarny ładunek liczony od znacznika
 * :SB-LADUNEK, więc operujemy na bajtach (latin1 = bajt na znak), a wstawka w nagłówku nie
 * przesuwa niczego względem znacznika. Token ma tylko znaki [A-Za-z0-9_-], bezpieczne w cmd.
 */
export function withDeviceToken(script: Buffer, deviceToken: string): Buffer {
    if (!/^[A-Za-z0-9_-]{43}$/.test(deviceToken)) throw new Error('Nieprawidłowy token urządzenia');
    const text = script.toString('latin1');
    const match = VERSION_LINE.exec(text);
    if (!match) throw new Error('Skrypt instalatora bez linii wersji - nie ma gdzie wstawić tokenu');
    const at = match.index + match[0].length;
    const eol = match[0].endsWith('\r\n') ? '\r\n' : '\n';
    return Buffer.concat([
        script.subarray(0, at),
        Buffer.from(`set "${DEVICE_TOKEN_VARIABLE}=${deviceToken}"${eol}`, 'latin1'),
        script.subarray(at),
    ]);
}

/** Paczka; z `deviceToken` skrypt niesie token urządzenia osoby, która ją pobrała. */
export function buildInstallerZip(deviceToken?: string): Buffer {
    const dir = installerAssetsDir();
    const zip = new AdmZip();
    for (const entry of INSTALLER_ENTRIES) {
        const content = fs.readFileSync(path.join(dir, entry));
        zip.addFile(entry, deviceToken ? withDeviceToken(content, deviceToken) : content);
    }
    return zip.toBuffer();
}
