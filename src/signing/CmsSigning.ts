import { X509Certificate, createHash, verify } from 'crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { SigningError } from './SigningError';

const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
export const OID_SIGNING_CERTIFICATE_V1 = '1.2.840.113549.1.9.16.2.12';
export const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const OID_COMMON_NAME = '2.5.4.3';
const OID_ORGANIZATION = '2.5.4.10';

export function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

export const sha256 = (data: Buffer): Buffer =>
    createHash('sha256').update(data).digest();

export function parseCertificate(der: Buffer): pkijs.Certificate {
    try {
        return pkijs.Certificate.fromBER(toArrayBuffer(der));
    } catch (e: any) {
        throw new SigningError(
            'INVALID_CERTIFICATE',
            'Certificate is not valid DER: ' + (e && e.message),
        );
    }
}

/** First value of the given attribute type in a distinguished name, or undefined. */
export function nameAttribute(
    name: pkijs.RelativeDistinguishedNames,
    oid: string,
): string | undefined {
    const found = name.typesAndValues.find((tv) => tv.type === oid);
    const value = found && (found.value.valueBlock as any).value;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function subjectName(cert: pkijs.Certificate): string {
    return (
        nameAttribute(cert.subject, OID_COMMON_NAME) ||
        nameAttribute(cert.subject, OID_ORGANIZATION) ||
        ''
    );
}

export function issuerName(cert: pkijs.Certificate): string {
    return (
        nameAttribute(cert.issuer, OID_COMMON_NAME) ||
        nameAttribute(cert.issuer, OID_ORGANIZATION) ||
        ''
    );
}

export function serialHex(cert: pkijs.Certificate): string {
    return Buffer.from(cert.serialNumber.valueBlock.valueHexView)
        .toString('hex')
        .toUpperCase();
}

export interface SignerCertificate {
    der: Buffer;
    cert: pkijs.Certificate;
    name: string;
}

/** Validates that the chain's first element is a usable RSA signer certificate. */
export function readSignerCertificate(chainDer: Buffer[]): SignerCertificate {
    if (!chainDer || chainDer.length === 0) {
        throw new SigningError('INVALID_CERTIFICATE', 'Certificate chain is empty.');
    }
    const der = chainDer[0];
    const cert = parseCertificate(der);
    let keyType: string | undefined;
    try {
        keyType = new X509Certificate(der).publicKey.asymmetricKeyType;
    } catch (e: any) {
        throw new SigningError(
            'INVALID_CERTIFICATE',
            'Certificate could not be read: ' + (e && e.message),
        );
    }
    if (keyType !== 'rsa') {
        throw new SigningError(
            'UNSUPPORTED_KEY',
            `Only RSA signing certificates are supported (got ${keyType}).`,
        );
    }
    const name = subjectName(cert);
    if (!name) {
        throw new SigningError(
            'INVALID_CERTIFICATE',
            'Certificate subject has neither a common name nor an organization.',
        );
    }
    return { der, cert, name };
}

export interface SignedAttributes {
    /** DER with the universal SET tag (0x31): the exact input of the signature hash. */
    der: Buffer;
    hash: Buffer;
}

/**
 * CAdES signed attributes: contentType, messageDigest and signingCertificateV2 (certHash plus
 * issuerSerial). There is deliberately no signingTime: the signing time lives in the PDF (/M),
 * and a CMS time would be an unverified claim. Proven on a qualified card in SIG-0.
 *
 * Attributes are listed in DER set order (shorter encodings first), so the encoding is canonical.
 */
export function buildSignedAttributes(
    signer: SignerCertificate,
    contentDigest: Buffer,
): SignedAttributes {
    const { cert } = signer;
    const issuerSerial = new asn1js.Sequence({
        value: [
            new asn1js.Sequence({
                value: [
                    new asn1js.Constructed({
                        idBlock: { tagClass: 3, tagNumber: 4 },
                        value: [cert.issuer.toSchema()],
                    }),
                ],
            }),
            cert.serialNumber,
        ],
    });
    const essCertIdV2 = new asn1js.Sequence({
        value: [
            new asn1js.OctetString({ valueHex: toArrayBuffer(sha256(signer.der)) }),
            issuerSerial,
        ],
    });
    const attributes = new pkijs.SignedAndUnsignedAttributes({
        type: 0,
        attributes: [
            new pkijs.Attribute({
                type: OID_CONTENT_TYPE,
                values: [new asn1js.ObjectIdentifier({ value: OID_DATA })],
            }),
            new pkijs.Attribute({
                type: OID_MESSAGE_DIGEST,
                values: [
                    new asn1js.OctetString({
                        valueHex: toArrayBuffer(contentDigest),
                    }),
                ],
            }),
            new pkijs.Attribute({
                type: OID_SIGNING_CERTIFICATE_V2,
                values: [
                    new asn1js.Sequence({
                        value: [new asn1js.Sequence({ value: [essCertIdV2] })],
                    }),
                ],
            }),
        ],
    });
    const der = Buffer.from(attributes.toSchema().toBER());
    der[0] = 0x31; // [0] IMPLICIT in the SignerInfo, but the signature covers the SET OF form
    return { der, hash: sha256(der) };
}

/**
 * RSA PKCS#1 v1.5 / SHA-256 check of `signature` over `signedAttributesDer` (the SET form).
 * The card receives only the hash, so this is also how the server proves that what came back
 * from the program really is a signature of that hash by that certificate.
 */
export function verifyRsaSha256(
    certificateDer: Buffer,
    signedAttributesDer: Buffer,
    signature: Buffer,
): boolean {
    try {
        return verify(
            'sha256',
            signedAttributesDer,
            new X509Certificate(certificateDer).publicKey,
            signature,
        );
    } catch (e) {
        return false;
    }
}

/** Builds the detached CMS ContentInfo (DER) for a signature over the given signed attributes. */
export function assembleCms(
    chainDer: Buffer[],
    signedAttributesDer: Buffer,
    signature: Buffer,
): Buffer {
    const certs = chainDer.map(parseCertificate);
    const leaf = certs[0];

    // Back to the [0] IMPLICIT form used inside SignerInfo.
    const implicit = Buffer.from(signedAttributesDer);
    if (implicit[0] !== 0x31) {
        throw new SigningError(
            'INVALID_PREPARED_PDF',
            'Signed attributes must be a DER SET (tag 0x31).',
        );
    }
    implicit[0] = 0xa0;
    const parsed = asn1js.fromBER(toArrayBuffer(implicit));
    if (parsed.offset === -1) {
        throw new SigningError(
            'INVALID_PREPARED_PDF',
            'Signed attributes are not valid DER.',
        );
    }
    const signedAttrs = new pkijs.SignedAndUnsignedAttributes({
        type: 0,
        schema: parsed.result,
    });

    const signerInfo = new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
            issuer: leaf.issuer,
            serialNumber: leaf.serialNumber,
        }),
        digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
        signedAttrs,
        signatureAlgorithm: new pkijs.AlgorithmIdentifier({
            algorithmId: OID_RSA_ENCRYPTION,
            algorithmParams: new asn1js.Null(),
        }),
        signature: new asn1js.OctetString({ valueHex: toArrayBuffer(signature) }),
    });
    const signedData = new pkijs.SignedData({
        version: 1,
        digestAlgorithms: [
            new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
        ],
        encapContentInfo: new pkijs.EncapsulatedContentInfo({
            eContentType: OID_DATA,
        }),
        certificates: certs,
        signerInfos: [signerInfo],
    });
    const cms = Buffer.from(
        new pkijs.ContentInfo({
            contentType: OID_SIGNED_DATA,
            content: signedData.toSchema(true),
        })
            .toSchema()
            .toBER(),
    );

    // The signature covers the exact bytes of signedAttributesDer, so the attributes embedded in
    // the CMS must be byte-identical to them (in the [0] IMPLICIT form).
    if (cms.indexOf(implicit) === -1) {
        throw new SigningError(
            'INVALID_PREPARED_PDF',
            'Signed attributes changed while being re-encoded.',
        );
    }
    return cms;
}
