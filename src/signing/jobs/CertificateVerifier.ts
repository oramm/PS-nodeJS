import { X509Certificate, createHash } from 'crypto';
import * as asn1js from 'asn1js';
import {
    issuerName,
    parseCertificate,
    serialHex,
    subjectName,
} from '../CmsSigning';
import { QUALIFIED_CA_ALLOWLIST, TrustedCa } from './QualifiedCaAllowlist';
import { SigningJobError } from './SigningJobError';

const OID_KEY_USAGE = '2.5.29.15';
const OID_BASIC_CONSTRAINTS = '2.5.29.19';
/** id-pe-qcStatements (RFC 3739): obecny w certyfikatach kwalifikowanych. */
const OID_QC_STATEMENTS = '1.3.6.1.5.5.7.1.3';
/** KeyUsage: bit 1 = nonRepudiation / contentCommitment (maska w pierwszym bajcie). */
const KEY_USAGE_NON_REPUDIATION_MASK = 0x40;

export interface VerifiedCertificate {
    /** Certyfikat podpisujacego (DER). */
    leafDer: Buffer;
    /** Numer seryjny, hex, wielkie litery. */
    serial: string;
    /** CN podmiotu (imie i nazwisko). Nie zawiera PESEL ani innych atrybutow. */
    subjectCn: string;
    /** CN wystawcy bezposredniego. */
    issuerCn: string;
    /** SHA-256 DER bezposredniego wystawcy (klucz "ktory to wystawca" dla numeru seryjnego). */
    issuerSha256: string;
    /** CA z listy, do ktorego doszedl lancuch. */
    trustedCa: TrustedCa;
}

export interface VerifyOptions {
    now?: Date;
    /** Wstrzykiwana lista CA (tylko testy). Produkcja uzywa QUALIFIED_CA_ALLOWLIST. */
    allowlist?: readonly TrustedCa[];
}

const reject = (message: string): never => {
    throw new SigningJobError('CERTIFICATE_REJECTED', message, 422);
};

export const sha256Hex = (der: Buffer): string =>
    createHash('sha256').update(der).digest('hex').toUpperCase();

function extension(x509: X509Certificate, oid: string): asn1js.AsnType | 'present' | undefined {
    // Skrypt pkijs jest uzywany tylko do odczytu rozszerzen, ktorych Node nie udostepnia.
    const cert = parseCertificate(x509.raw);
    const found = (cert.extensions || []).find((e) => e.extnID === oid);
    if (!found) return undefined;
    const parsed = asn1js.fromBER(
        found.extnValue.valueBlock.valueHexView.slice().buffer as ArrayBuffer
    );
    return parsed.offset === -1 ? 'present' : parsed.result;
}

function hasNonRepudiation(x509: X509Certificate): boolean {
    const value = extension(x509, OID_KEY_USAGE);
    if (!value || value === 'present') return false;
    if (!(value instanceof asn1js.BitString)) return false;
    const bytes = value.valueBlock.valueHexView;
    return bytes.length > 0 && (bytes[0] & KEY_USAGE_NON_REPUDIATION_MASK) !== 0;
}

function isCa(x509: X509Certificate): boolean {
    const value = extension(x509, OID_BASIC_CONSTRAINTS);
    if (!value || value === 'present' || !(value instanceof asn1js.Sequence))
        return false;
    const first = value.valueBlock.value[0];
    return first instanceof asn1js.Boolean && first.valueBlock.value === true;
}

function assertValidAt(x509: X509Certificate, now: Date, who: string): void {
    if (now < new Date(x509.validFrom) || now > new Date(x509.validTo)) {
        reject(`${who} jest po terminie ważności albo jeszcze nie obowiązuje.`);
    }
}

/**
 * Sprawdza certyfikat podpisujacego na serwerze (SIG-2). "Certyfikat zgadza sie z przeslanym"
 * nic nie dowodzi, wiec sprawdzamy kryptograficznie:
 *  1. lancuch: kazdy certyfikat jest podpisany kluczem nastepnego, a lancuch dochodzi do CA
 *     z listy zaufanych (po odcisku SHA-256 calego certyfikatu - nie po nazwie wystawcy),
 *  2. certyfikaty CA w lancuchu sa CA (BasicConstraints) i obowiazuja dzis,
 *  3. certyfikat podpisujacego obowiazuje dzis, ma klucz RSA, KeyUsage z nonRepudiation
 *     i rozszerzenie QcStatements (certyfikat kwalifikowany).
 * Odwolania (CRL/OCSP) nie sa sprawdzane w v1.
 *
 * Wszystkie odmowy to SigningJobError CERTIFICATE_REJECTED (422) z komunikatem po polsku.
 */
export function verifySigningCertificate(
    chainDer: Buffer[],
    options: VerifyOptions = {}
): VerifiedCertificate {
    const now = options.now ?? new Date();
    const allowlist = options.allowlist ?? QUALIFIED_CA_ALLOWLIST;

    if (!Array.isArray(chainDer) || chainDer.length === 0)
        return reject('Program nie przysłał certyfikatu.');
    if (chainDer.length > 10)
        return reject('Łańcuch certyfikatów jest nienormalnie długi.');

    let chain: X509Certificate[];
    try {
        chain = chainDer.map((der) => new X509Certificate(der));
    } catch {
        return reject('Certyfikat jest nieczytelny.');
    }
    const leaf = chain[0];

    if (chain.length < 2)
        return reject(
            'Brak certyfikatów urzędu wystawiającego w łańcuchu. Zaufanego certyfikatu nie da się potwierdzić.'
        );

    // 1. Lancuch do CA z listy.
    const trustedByFingerprint = new Map(
        allowlist.map((ca) => [ca.sha256.toUpperCase(), ca])
    );
    let trustedIndex = -1;
    let trustedCa: TrustedCa | undefined;
    for (let i = 1; i < chain.length; i++) {
        const child = chain[i - 1];
        const issuer = chain[i];
        const linked =
            child.issuer === issuer.subject && child.verify(issuer.publicKey);
        if (!linked) break;
        const known = trustedByFingerprint.get(sha256Hex(chainDer[i]));
        if (known) {
            trustedIndex = i;
            trustedCa = known;
            break;
        }
    }
    if (trustedIndex < 0 || !trustedCa)
        return reject(
            'Certyfikat nie pochodzi od zaufanego urzędu certyfikacji podpisów kwalifikowanych.'
        );

    // 2. CA w lancuchu: musza byc CA i obowiazywac.
    for (let i = 1; i <= trustedIndex; i++) {
        if (!isCa(chain[i]))
            return reject('Certyfikat urzędu w łańcuchu nie jest certyfikatem CA.');
        assertValidAt(chain[i], now, 'Certyfikat urzędu certyfikacji');
    }

    // 3. Certyfikat podpisujacego.
    if (isCa(leaf))
        return reject('To jest certyfikat urzędu certyfikacji, a nie osoby podpisującej.');
    assertValidAt(leaf, now, 'Certyfikat podpisującego');
    if (leaf.publicKey.asymmetricKeyType !== 'rsa')
        return reject(
            'Karta z kluczem innym niż RSA nie jest obsługiwana. Użyj opcji „Wgraj podpisany”.'
        );
    if (!hasNonRepudiation(leaf))
        return reject(
            'Certyfikat nie służy do składania podpisów (brak użycia klucza „niezaprzeczalność”).'
        );
    if (extension(leaf, OID_QC_STATEMENTS) === undefined)
        return reject(
            'To nie jest certyfikat kwalifikowany (brak rozszerzenia QcStatements).'
        );

    const parsedLeaf = parseCertificate(chainDer[0]);
    const subjectCn = subjectName(parsedLeaf);
    if (!subjectCn)
        return reject('Certyfikat nie zawiera imienia i nazwiska podpisującego.');

    return {
        leafDer: chainDer[0],
        serial: serialHex(parsedLeaf),
        subjectCn,
        issuerCn: issuerName(parsedLeaf),
        issuerSha256: sha256Hex(chainDer[1]),
        trustedCa,
    };
}
