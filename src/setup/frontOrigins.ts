/**
 * Adresy frontu PS (przegladarka), ktore moga rozmawiac z backendem z ciasteczkiem sesji.
 * Jedna lista dla CORS i dla tras, ktore przy GET zmieniaja stan (paczka instalatora SB).
 */
export const FRONT_ORIGINS: readonly string[] = [
    'http://localhost', // Port 80 (domyślny)
    'http://localhost:9000', // Apache - MUSISZ dodać jawnie
    'http://localhost:9010', // front dev na porcie zapasowym, gdy 9000 jest zajęty
                             // przez równoległą sesję (przegląd wizualny UI lokalnie)
    'https://erp-envi.herokuapp.com',
    'https://ps.envi.com.pl',
];

/**
 * Czy zadanie przyszlo ze strony frontu PS: naglowek Origin, a bez niego Referer.
 * Brak obu = nie (strona obca moze wylaczyc Referer, wiec brak nie jest dowodem).
 * Sec-Fetch-Site nie wystarcza: front (ps.envi.com.pl) i backend (herokuapp.com) to rozne
 * "site", wiec poprawne klikniecie tez jest cross-site.
 */
export function isFromFrontOrigin(headers: { origin?: string; referer?: string }): boolean {
    const source = headers.origin || headers.referer;
    if (!source) return false;
    try {
        return FRONT_ORIGINS.includes(new URL(source).origin);
    } catch {
        return false;
    }
}
