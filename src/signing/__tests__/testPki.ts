import {
    KeyObject,
    constants,
    createPrivateKey,
    generateKeyPairSync,
    privateEncrypt,
    webcrypto,
} from 'crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

/**
 * Throw-away PKI for the signing tests: a software RSA key and a self-made CA chain. The real
 * smart card is never involved in automated tests.
 */
pkijs.setEngine(
    'test-node',
    new pkijs.CryptoEngine({ name: 'test-node', crypto: webcrypto as any }),
);

export interface TestIdentity {
    /** DER certificates, leaf first, then intermediate, then root. */
    chainDer: Buffer[];
    privateKey: KeyObject;
    leafSerialHex: string;
}

const ab = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function name(commonName: string): pkijs.RelativeDistinguishedNames {
    return new pkijs.RelativeDistinguishedNames({
        typesAndValues: [
            new pkijs.AttributeTypeAndValue({
                type: '2.5.4.6',
                value: new asn1js.PrintableString({ value: 'PL' }),
            }),
            new pkijs.AttributeTypeAndValue({
                type: '2.5.4.3',
                value: new asn1js.Utf8String({ value: commonName }),
            }),
        ],
    });
}

function extension(oid: string, critical: boolean, value: asn1js.AsnType) {
    return new pkijs.Extension({
        extnID: oid,
        critical,
        extnValue: value.toBER(false),
    });
}

async function issue(options: {
    commonName: string;
    serial: number;
    issuerName: pkijs.RelativeDistinguishedNames;
    issuerKey: KeyObject;
    subjectKey: KeyObject;
    isCa: boolean;
}): Promise<{ der: Buffer; name: pkijs.RelativeDistinguishedNames }> {
    const cert = new pkijs.Certificate();
    cert.version = 2;
    cert.serialNumber = new asn1js.Integer({ value: options.serial });
    cert.subject = name(options.commonName);
    cert.issuer = options.issuerName;
    cert.notBefore.value = new Date('2025-01-01T00:00:00Z');
    cert.notAfter.value = new Date('2035-01-01T00:00:00Z');
    const spki = options.subjectKey.export({ type: 'spki', format: 'der' }) as Buffer;
    cert.subjectPublicKeyInfo = new pkijs.PublicKeyInfo({
        schema: asn1js.fromBER(ab(spki)).result,
    });
    // KeyUsage: keyCertSign for CAs, nonRepudiation (contentCommitment) for the signer.
    const usageByte = options.isCa ? 0x04 : 0x40;
    cert.extensions = [
        extension(
            '2.5.29.19',
            true,
            new pkijs.BasicConstraints({ cA: options.isCa }).toSchema(),
        ),
        extension(
            '2.5.29.15',
            true,
            new asn1js.BitString({
                valueHex: new Uint8Array([usageByte]).buffer,
                unusedBits: options.isCa ? 5 : 6,
            }),
        ),
    ];
    const signingKey = await webcrypto.subtle.importKey(
        'pkcs8',
        options.issuerKey.export({ type: 'pkcs8', format: 'der' }),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    await cert.sign(signingKey as any, 'SHA-256');
    return {
        der: Buffer.from(cert.toSchema(true).toBER()),
        name: cert.subject,
    };
}

/** Builds root -> intermediate -> signer. `signerName` may contain Polish diacritics. */
export async function createTestIdentity(
    signerName = 'Jan Testowy',
    modulusLength = 2048,
): Promise<TestIdentity> {
    const rsa = () => generateKeyPairSync('rsa', { modulusLength });
    const rootKeys = rsa();
    const interKeys = rsa();
    const leafKeys = rsa();

    const root = await issue({
        commonName: 'ENVI Test Root CA',
        serial: 1,
        issuerName: name('ENVI Test Root CA'),
        issuerKey: rootKeys.privateKey,
        subjectKey: rootKeys.publicKey,
        isCa: true,
    });
    const inter = await issue({
        commonName: 'ENVI Test Kwalifikowany CA',
        serial: 2,
        issuerName: root.name,
        issuerKey: rootKeys.privateKey,
        subjectKey: interKeys.publicKey,
        isCa: true,
    });
    const leaf = await issue({
        commonName: signerName,
        serial: 0x1234abcd,
        issuerName: inter.name,
        issuerKey: interKeys.privateKey,
        subjectKey: leafKeys.publicKey,
        isCa: false,
    });
    return {
        chainDer: [leaf.der, inter.der, root.der],
        privateKey: createPrivateKey(
            leafKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ),
        leafSerialHex: '1234ABCD',
    };
}

// DER prefix of DigestInfo for SHA-256: what an RSA card prepends to the hash it is given.
const SHA256_DIGEST_INFO = Buffer.from('3031300d060960864801650304020105000420', 'hex');

/**
 * What the smart card does: it receives only the 32-byte hash and returns an RSA PKCS#1 v1.5
 * signature over DigestInfo(SHA-256, hash).
 */
export function softwareCardSign(hash: Buffer, privateKey: KeyObject): Buffer {
    return privateEncrypt(
        { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
        Buffer.concat([SHA256_DIGEST_INFO, hash]),
    );
}
