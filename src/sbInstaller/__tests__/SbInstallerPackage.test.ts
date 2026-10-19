import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import {
    DEVICE_TOKEN_VARIABLE,
    INSTALLER_ENTRIES,
    buildInstallerZip,
    installerAssetsDir,
    withDeviceToken,
} from '../SbInstallerPackage';

describe('paczka instalatora Second Brain', () => {
    const zip = new AdmZip(buildInstallerZip());
    const names = zip.getEntries().map((e) => e.entryName);

    it('zawiera jeden plik do dwukliku i nic poza nim', () => {
        // Instalator sam sie wypakowuje (skrypt jedzie w srodku .cmd), wiec drugi plik w ZIP-ie
        // bylby albo zbedny, albo starsza kopia obok wlasciwej.
        expect(names).toEqual(INSTALLER_ENTRIES);
    });

    it('oddaje bajt w bajt to, co lezy w assets - nie starsza kopie z build/', () => {
        for (const entry of INSTALLER_ENTRIES) {
            const fromDisk = fs.readFileSync(
                path.join(installerAssetsDir(), entry),
            );
            expect(zip.readFile(entry)).toEqual(fromDisk);
        }
    });

    it('plik niesie skrypt w srodku - kontrola pozytywna dla testow wyzej', () => {
        const cmd = zip.readAsText(INSTALLER_ENTRIES[0]);
        expect(cmd).toContain(':SB-LADUNEK');
        expect(cmd).toContain('#SB-PLIK bootstrap.ps1 ');
    });

    it('token urządzenia (SBD-2): jedna linia za wersją, reszta pliku bajt w bajt', () => {
        const token = 'A'.repeat(20) + '-_' + 'b'.repeat(21);
        const original = fs.readFileSync(path.join(installerAssetsDir(), INSTALLER_ENTRIES[0]));
        const withToken = new AdmZip(buildInstallerZip(token)).readFile(INSTALLER_ENTRIES[0])!;
        const line = Buffer.from(`set "${DEVICE_TOKEN_VARIABLE}=${token}"\r\n`, 'latin1');
        const at = withToken.indexOf(line);
        expect(at).toBeGreaterThan(0);
        expect(withToken.subarray(0, at).toString('latin1')).toMatch(/set "SB_INSTALATOR_WERSJA=[^"]*"\r\n$/);
        expect(Buffer.concat([withToken.subarray(0, at), withToken.subarray(at + line.length)])).toEqual(original);
        expect(withToken.toString('latin1')).toContain(':SB-LADUNEK');
    });

    it('token o złym kształcie nie trafia do skryptu', () => {
        expect(() => withDeviceToken(Buffer.from('set "SB_INSTALATOR_WERSJA=1"\r\n'), 'x" & del *')).toThrow();
    });
});
