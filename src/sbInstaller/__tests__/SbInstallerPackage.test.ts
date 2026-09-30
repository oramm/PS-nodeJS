import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import {
    INSTALLER_ENTRIES,
    buildInstallerZip,
    installerAssetsDir,
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
});
