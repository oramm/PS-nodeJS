import { X509Certificate, createHash, verify } from 'crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import {
    OID_SIGNING_CERTIFICATE_V1,
    OID_SIGNING_CERTIFICATE_V2,
    issuerName,
    serialHex,
    subjectName,
    toArrayBuffer,
} from './CmsSigning';
import { ByteRange, readByteRanges, signedBytes } from './PdfSignatureLayout';
import { ValidationResult } from './SigningTypes';

const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SUBJECT_KEY_IDENTIFIER = '2.5.29.14';
const DIGEST_ALGORITHMS: Record<string, string> = {
    '1.3.14.3.2.26': 'sha1',
    '2.16.840.1.101.3.4.2.1': 'sha256',
    '2.16.840.1.101.3.4.2.2': 'sha384',
    '2.16.840.1.101.3.4.2.3': 'sha512',
};
const OID_RSA_PSS = '1.2.840.113549.1.1.10';
const OID_ECDSA_PREFIX = '1.2.840.10045.4.';

interface SignatureCheck {
    reasons: string[];
    cert?: pkijs.Certificate;
    certDers: Buffer[];
}

/** Hex string of `/Contents <...>` trimmed to the real DER length (the rest is zero padding). */
function readContentsDer(pdf: Buffer, range: ByteRange): Buffer | undefined {
    const raw = pdf.subarray(range.contentsStart, range.contentsEnd).toString('latin1');
    if (raw.length < 4 || raw[0] !== '<' || raw[raw.length - 1] !== '>') {
        return undefined;
    }
    const hex = raw.slice(1, -1).replace(/\s+/g, '');
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return undefined;
    const bytes = Buffer.from(hex, 'hex');
    // DER header: tag, then the length (short or long form) gives the real size.
    if (bytes.length < 2 || bytes[0] !== 0x30) return undefined;
    let length = bytes[1];
    let header = 2;
    if (length & 0x80) {
        const count = length & 0x7f;
        if (count < 1 || count > 4 || bytes.length < 2 + count) return undefined;
        length = 0;
        for (let i = 0; i < count; i++) length = length * 256 + bytes[2 + i];
        header = 2 + count;
    }
    if (header + length > bytes.length) return undefined;
    return bytes.subarray(0, header + length);
}

function sameBytes(a: ArrayBuffer | Uint8Array, b: Buffer): boolean {
    return Buffer.from(a instanceof Uint8Array ? a : new Uint8Array(a)).equals(b);
}

function findSignerCertificate(
    signedData: pkijs.SignedData,
    signerInfo: pkijs.SignerInfo,
): pkijs.Certificate | undefined {
    const certs = (signedData.certificates || []).filter(
        (c): c is pkijs.Certificate => c instanceof pkijs.Certificate,
    );
    const sid: any = signerInfo.sid;
    if (sid instanceof pkijs.IssuerAndSerialNumber) {
        return certs.find(
            (c) =>
                c.serialNumber.isEqual(sid.serialNumber) &&
                sameBytes(
                    new Uint8Array(c.issuer.toSchema().toBER()),
                    Buffer.from(sid.issuer.toSchema().toBER()),
                ),
        );
    }
    // SignerIdentifier by subject key identifier (an OCTET STRING).
    const ski: ArrayBuffer | undefined =
        sid && sid.valueBlock && sid.valueBlock.valueHexView;
    if (!ski) return undefined;
    return certs.find((c) => {
        const ext = (c.extensions || []).find(
            (e) => e.extnID === OID_SUBJECT_KEY_IDENTIFIER,
        );
        const value: any = ext && ext.parsedValue;
        return (
            value &&
            value.valueBlock &&
            sameBytes(value.valueBlock.valueHexView, Buffer.from(ski))
        );
    });
}

/** Checks the signingCertificate(V2) attribute, if the signature carries one. */
function checkSigningCertificateAttribute(
    attributes: pkijs.Attribute[],
    certDer: Buffer,
    reasons: string[],
): void {
    for (const attribute of attributes) {
        const isV2 = attribute.type === OID_SIGNING_CERTIFICATE_V2;
        if (!isV2 && attribute.type !== OID_SIGNING_CERTIFICATE_V1) continue;
        try {
            // SigningCertificate(V2) ::= SEQUENCE { certs SEQUENCE OF ESSCertID(V2), ... }
            const signingCertificate: any = attribute.values[0];
            const essCertId = signingCertificate.valueBlock.value[0].valueBlock.value[0];
            const parts: any[] = essCertId.valueBlock.value;
            let hashAlgorithm = isV2 ? 'sha256' : 'sha1';
            if (isV2 && parts[0] instanceof asn1js.Sequence) {
                const oid = parts[0].valueBlock.value[0] as asn1js.ObjectIdentifier;
                hashAlgorithm = DIGEST_ALGORITHMS[oid.getValue()] || '';
            }
            const hashOctets = parts.find((p) => p instanceof asn1js.OctetString);
            if (!hashAlgorithm) throw new Error('unsupported certHash algorithm');
            const expected = createHash(hashAlgorithm).update(certDer).digest();
            if (!hashOctets || !sameBytes(hashOctets.valueBlock.valueHexView, expected)) {
                reasons.push(
                    'The signingCertificate attribute does not match the signer certificate.',
                );
            }
        } catch (e) {
            reasons.push('The signingCertificate attribute could not be read.');
        }
    }
}

function checkOneSignature(pdf: Buffer, range: ByteRange): SignatureCheck {
    const reasons: string[] = [];
    const fail = (reason: string): SignatureCheck => ({
        reasons: reasons.concat(reason),
        certDers: [],
    });

    const [from1, length1, from2, length2] = range.values;
    if (
        from1 !== 0 ||
        from1 + length1 > range.contentsStart ||
        from2 < range.contentsEnd ||
        from2 + length2 > pdf.length ||
        pdf[range.contentsStart] !== 0x3c
    ) {
        return fail('The /ByteRange of the signature is malformed.');
    }
    const cmsDer = readContentsDer(pdf, range);
    if (!cmsDer) return fail('The signature contents are not a readable CMS structure.');

    let signedData: pkijs.SignedData;
    try {
        const parsed = asn1js.fromBER(toArrayBuffer(cmsDer));
        if (parsed.offset === -1) throw new Error('not DER');
        const contentInfo = new pkijs.ContentInfo({ schema: parsed.result });
        signedData = new pkijs.SignedData({ schema: contentInfo.content });
    } catch (e: any) {
        return fail('The signature contents are not valid CMS: ' + (e && e.message));
    }

    const certDers = (signedData.certificates || [])
        .filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate)
        .map((c) => Buffer.from(c.toSchema().toBER()));

    if (signedData.signerInfos.length !== 1) {
        reasons.push('The signature must have exactly one signer.');
        return { reasons, certDers };
    }
    const signerInfo = signedData.signerInfos[0];
    const cert = findSignerCertificate(signedData, signerInfo);
    if (!cert) {
        reasons.push('The signer certificate is not included in the signature.');
        return { reasons, certDers };
    }
    // Put the signer first, so callers can treat certDers[0] as the leaf.
    const certDer = Buffer.from(cert.toSchema().toBER());
    const ordered = [certDer].concat(certDers.filter((d) => !d.equals(certDer)));

    const hashName = DIGEST_ALGORITHMS[signerInfo.digestAlgorithm.algorithmId];
    if (!hashName) {
        reasons.push(
            'Unsupported digest algorithm ' + signerInfo.digestAlgorithm.algorithmId + '.',
        );
        return { reasons, cert, certDers: ordered };
    }
    const content = signedBytes(pdf, range);
    const contentDigest = createHash(hashName).update(content).digest();

    let signedPayload: Buffer;
    if (signerInfo.signedAttrs) {
        const attributes = signerInfo.signedAttrs.attributes;
        const messageDigest = attributes.find((a) => a.type === OID_MESSAGE_DIGEST);
        const digestValue: any = messageDigest && messageDigest.values[0];
        if (
            !digestValue ||
            !sameBytes(digestValue.valueBlock.valueHexView, contentDigest)
        ) {
            reasons.push(
                'The document digest does not match the signature: the file was changed after signing.',
            );
        }
        checkSigningCertificateAttribute(attributes, certDer, reasons);
        // The signature covers the attributes as a SET OF, not as the [0] IMPLICIT field.
        signedPayload = Buffer.from(signerInfo.signedAttrs.encodedValue);
        signedPayload[0] = 0x31;
    } else {
        signedPayload = content;
    }

    const signatureAlgorithm = signerInfo.signatureAlgorithm.algorithmId;
    if (signatureAlgorithm === OID_RSA_PSS) {
        reasons.push('RSA-PSS signatures are not supported.');
        return { reasons, cert, certDers: ordered };
    }
    try {
        const publicKey = new X509Certificate(certDer).publicKey;
        const signature = Buffer.from(signerInfo.signature.valueBlock.valueHexView);
        const ok = signatureAlgorithm.startsWith(OID_ECDSA_PREFIX)
            ? verify(hashName, signedPayload, { key: publicKey, dsaEncoding: 'der' }, signature)
            : verify(hashName, signedPayload, publicKey, signature);
        if (!ok) reasons.push('The cryptographic signature does not verify.');
    } catch (e: any) {
        reasons.push('The cryptographic signature could not be checked: ' + (e && e.message));
    }
    return { reasons, cert, certDers: ordered };
}

/**
 * Cryptographic validation of the signatures in a PDF: the document digest, the signature over
 * the signed attributes with the embedded certificate, the signingCertificate binding, and whether
 * the last signature covers the whole file. It does NOT judge the certificate (validity dates,
 * qualified issuer, revocation): that is the caller's policy.
 */
export function validate(pdfBytes: Buffer): ValidationResult {
    const ranges = readByteRanges(pdfBytes);
    const empty: ValidationResult = {
        valid: false,
        signerName: '',
        certSerial: '',
        issuer: '',
        byteRangeCoversFile: false,
        reasons: [],
        chainDer: [],
    };
    if (ranges.length === 0) {
        return { ...empty, reasons: ['The PDF has no signature.'] };
    }

    const reasons: string[] = [];
    let last: SignatureCheck | undefined;
    ranges.forEach((range, index) => {
        const check = checkOneSignature(pdfBytes, range);
        const prefix = ranges.length > 1 ? `Signature ${index + 1}: ` : '';
        check.reasons.forEach((r) => reasons.push(prefix + r));
        last = check;
    });

    const lastRange = ranges[ranges.length - 1];
    const covers =
        lastRange.values[0] === 0 &&
        lastRange.values[2] + lastRange.values[3] === pdfBytes.length;
    if (!covers) {
        reasons.push(
            'The last signature does not cover the whole file: bytes were added after signing.',
        );
    }

    const cert = last && last.cert;
    return {
        valid: reasons.length === 0 && !!cert,
        signerName: cert ? subjectName(cert) : '',
        certSerial: cert ? serialHex(cert) : '',
        issuer: cert ? issuerName(cert) : '',
        byteRangeCoversFile: covers,
        reasons,
        chainDer: last ? last.certDers : [],
    };
}

