import { createHash, randomBytes } from 'crypto';
import { SbAccessError } from './sbAccessPolicy';
import { SbAccessLevels, SbPublicKeyJwk } from './sbAccessTypes';

/**
 * Reguły szyfrowanych haseł SB (plan SBD, SBD-2). Czyste funkcje, bez I/O.
 *
 * Model: admin szyfruje hasło w przeglądarce kluczem publicznym komputera pracownika
 * (RSA-OAEP, SHA-256, 2048 bit), PS zapisuje tylko szyfrogram, odszyfrowuje wyłącznie
 * instalator SB na komputerze pracownika (klucz prywatny pod DPAPI, SBD-3).
 */

/** Hasło bazy PS: jedno wspólne konto agentów (decyzja właściciela 2026-10-19); poziom odczyt/zapis to etykieta. */
export const SB_SECRET_PS_DB = 'baza-ps';
const MAIL_PREFIX = 'poczta-';

/**
 * JEDYNE miejsce reguły "jakie hasła wynikają z uprawnień": jedno na każdą skrzynkę poczty
 * i jedno na bazę PS, gdy poziom bazy jest inny niż brak. Hasła spoza tej listy nie da się
 * udostępnić, a przy zmianie poziomów wypadają z bazy.
 */
export function expectedSecretNames(levels: SbAccessLevels): string[] {
    return [
        ...levels.mail.map((code) => MAIL_PREFIX + code),
        ...(levels.psDb !== 'none' ? [SB_SECRET_PS_DB] : []),
    ];
}

/** Nazwa po ludzku do historii i na ekran. */
export function describeSecretName(name: string): string {
    if (name === SB_SECRET_PS_DB) return 'baza PS';
    return name.startsWith(MAIL_PREFIX) ? `poczta ${name.slice(MAIL_PREFIX.length)}` : name;
}

const RSA_MODULUS_BYTES = 256; // 2048 bit
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** Pola klucza prywatnego RSA w JWK - ich obecność oznacza pomyłkę instalatora; odrzucamy. */
const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];

/**
 * Walidacja klucza publicznego: kty RSA, e AQAB, moduł dokładnie 2048 bit.
 * Zwraca tylko pola kanoniczne - nic więcej nie trafia do bazy.
 */
export function parsePublicKeyJwk(raw: unknown): SbPublicKeyJwk {
    const jwk = raw as any;
    const invalid = () =>
        new SbAccessError(400, 'Nieprawidłowy klucz publiczny (wymagany RSA 2048, wykładnik AQAB).');
    if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) throw invalid();
    if (PRIVATE_FIELDS.some((field) => field in jwk))
        throw new SbAccessError(400, 'Przesłano klucz prywatny - wysyła się wyłącznie klucz publiczny.');
    if (jwk.kty !== 'RSA' || jwk.e !== 'AQAB') throw invalid();
    if (typeof jwk.n !== 'string' || !BASE64URL.test(jwk.n)) throw invalid();
    const modulus = Buffer.from(jwk.n, 'base64url');
    if (modulus.length !== RSA_MODULUS_BYTES || (modulus[0] & 0x80) === 0) throw invalid();
    if (modulus.toString('base64url') !== jwk.n) throw invalid();
    return { kty: 'RSA', n: jwk.n, e: 'AQAB' };
}

/**
 * Odcisk klucza wg RFC 7638: SHA-256 nad kanonicznym JSON {"e","kty","n"} (klucze w kolejności
 * alfabetycznej, bez spacji). Zwracany jako hex małymi literami (64 znaki). Ta sama definicja
 * obowiązuje w instalatorze (SBD-3).
 */
export function keyThumbprint(jwk: SbPublicKeyJwk): string {
    const canonical = `{"e":"${jwk.e}","kty":"${jwk.kty}","n":"${jwk.n}"}`;
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Odcisk na ekran: pierwsze 8 znaków hex w dwóch grupach, np. "a3f9 1c07". */
export function displayFingerprint(thumbprint: string): string {
    return `${thumbprint.slice(0, 4)} ${thumbprint.slice(4, 8)}`;
}

/** Szyfrogram RSA-OAEP dla klucza 2048 bit: base64 (standardowe, z dopełnieniem) dokładnie 256 bajtów. */
export function parseCiphertext(raw: unknown): string {
    const invalid = new SbAccessError(400, 'Nieprawidłowy szyfrogram (oczekiwano base64, 256 bajtów).');
    if (typeof raw !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw invalid;
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length !== RSA_MODULUS_BYTES || bytes.toString('base64') !== raw) throw invalid;
    return raw;
}

export function parseSecretName(raw: unknown): string {
    if (typeof raw !== 'string' || !/^[a-z0-9-]{1,60}$/.test(raw))
        throw new SbAccessError(400, 'Nieprawidłowa nazwa hasła.');
    return raw;
}

/**
 * Token urządzenia: poświadczenie instalatora SB, który nie ma sesji przeglądarki.
 * 32 bajty losowe (base64url, 43 znaki); w bazie tylko skrót SHA-256 hex.
 */
export const SB_DEVICE_TOKEN_HEADER = 'x-envi-sb-device-token';
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newDeviceToken(): string {
    return randomBytes(32).toString('base64url');
}

/** Skrót tokenu do bazy; null dla wartości, która nie może być tokenem (bez zapytania do bazy). */
export function deviceTokenHash(token: unknown): string | null {
    if (typeof token !== 'string' || !DEVICE_TOKEN_PATTERN.test(token)) return null;
    return createHash('sha256').update(token, 'utf8').digest('hex');
}
