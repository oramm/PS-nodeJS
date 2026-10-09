import fs from 'fs';
import path from 'path';

/**
 * Graphic and fonts of the visible signature live under assets/signing. They are resolved from the
 * process working directory (like assets/sb-installer): `tsc` copies no assets, so a path relative
 * to this module would point into build/ in production.
 *
 * Fonts: Open Sans 3.003 (SIL Open Font License 1.1, see assets/signing/LICENSE-OpenSans-OFL.txt).
 * The OFL explicitly allows embedding the font in documents. A TTF is needed because the standard
 * PDF fonts cannot encode Polish diacritics.
 */
export const signingAssetsDir = () =>
    path.resolve(process.cwd(), 'assets', 'signing');

export interface SigningAssets {
    icon: Buffer;
    fontRegular: Buffer;
    fontBold: Buffer;
}

let cached: SigningAssets | undefined;

export function loadSigningAssets(): SigningAssets {
    if (!cached) {
        const dir = signingAssetsDir();
        cached = {
            icon: fs.readFileSync(
                path.join(dir, 'envi_podpis_symbol_96x96_transparent.png'),
            ),
            fontRegular: fs.readFileSync(
                path.join(dir, 'OpenSans-Regular.ttf'),
            ),
            fontBold: fs.readFileSync(path.join(dir, 'OpenSans-Bold.ttf')),
        };
    }
    return cached;
}
