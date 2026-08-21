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

    it('zawiera launcher razem ze skryptem, ktory ten launcher uruchamia', () => {
        // To jest cale uzasadnienie paczki: bootstrap.cmd wola %~dp0bootstrap.ps1, wiec sam
        // bootstrap.cmd bylby plikiem bez tresci do uruchomienia.
        expect(names).toEqual(expect.arrayContaining(INSTALLER_ENTRIES));
    });

    it('oddaje bajt w bajt to, co lezy w assets - nie starsza kopie z build/', () => {
        for (const entry of INSTALLER_ENTRIES) {
            const fromDisk = fs.readFileSync(
                path.join(installerAssetsDir(), entry),
            );
            expect(zip.readFile(entry)).toEqual(fromDisk);
        }
    });

    it('launcher szuka skryptu obok siebie - kontrola pozytywna dla testu wyzej', () => {
        expect(zip.readAsText('bootstrap.cmd')).toContain('%~dp0bootstrap.ps1');
    });
});
