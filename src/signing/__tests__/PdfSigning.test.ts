import { createHash } from 'crypto';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { SigningError, finalize, prepare, validate } from '..';
import { formatSigningDate } from '../SignatureAppearance';
import { readByteRanges } from '../PdfSignatureLayout';
import { TestIdentity, createTestIdentity, softwareCardSign } from './testPki';
import { makeFixture, widgets } from './testPdfs';

const NOW = new Date('2026-10-09T10:15:30Z');
const POLISH_NAME = 'Żaneta Gęślarz-Łoś';
const LETTER = [
    { x: 60, y: 760, text: 'Pismo testowe ENVI - nie jest to prawdziwy dokument.' },
    { x: 400, y: 400, text: 'Z poważaniem,' },
    { x: 60, y: 60, text: 'Stopka' },
];

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();
const ab = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

let identity: TestIdentity;
let letter: Buffer;

beforeAll(async () => {
    identity = await createTestIdentity(POLISH_NAME);
    letter = await makeFixture({ lines: LETTER });
});

async function signFully(
    pdf: Buffer,
    placement: Parameters<typeof prepare>[2] = 'letterClosing',
) {
    const prepared = await prepare(pdf, identity.chainDer, placement, { now: NOW });
    const signature = softwareCardSign(prepared.hashToSign, identity.privateKey);
    const signed = finalize(
        prepared.preparedPdf,
        prepared.signedAttrsDer,
        signature,
        identity.chainDer,
    );
    return { prepared, signature, signed };
}

/** The CMS of the only signature in a PDF, parsed. */
function readCms(pdf: Buffer): pkijs.SignedData {
    const [range] = readByteRanges(pdf);
    const hex = pdf
        .subarray(range.contentsStart + 1, range.contentsEnd - 1)
        .toString('latin1');
    const der = Buffer.from(hex, 'hex');
    // Trailing zero padding is ignored by the BER parser after the first complete element.
    const parsed = asn1js.fromBER(ab(der));
    return new pkijs.SignedData({
        schema: new pkijs.ContentInfo({ schema: parsed.result }).content,
    });
}

describe('PDF signing - prepare / finalize / validate (software key, no card)', () => {
    describe('full round trip', () => {
        it('produces a PDF that validates, with the signer from the certificate', async () => {
            const { signed } = await signFully(letter);
            const result = validate(signed);

            expect(result.reasons).toEqual([]);
            expect(result.valid).toBe(true);
            expect(result.signerName).toBe(POLISH_NAME);
            expect(result.issuer).toBe('ENVI Test Kwalifikowany CA');
            expect(result.certSerial).toBe(identity.leafSerialHex);
            expect(result.byteRangeCoversFile).toBe(true);
            expect(result.chainDer).toHaveLength(3);
            expect(result.chainDer[0].equals(identity.chainDer[0])).toBe(true);
        });

        it('has a ByteRange that covers the whole file except the placeholder', async () => {
            const { signed } = await signFully(letter);
            const ranges = readByteRanges(signed);
            expect(ranges).toHaveLength(1);
            const [from1, length1, from2, length2] = ranges[0].values;

            expect(from1).toBe(0);
            expect(from2 + length2).toBe(signed.length);
            expect(from1 + length1).toBe(ranges[0].contentsStart);
            expect(from2).toBe(ranges[0].contentsEnd);
            // the excluded gap is exactly one hex string
            expect(signed[ranges[0].contentsStart]).toBe('<'.charCodeAt(0));
            expect(signed[ranges[0].contentsEnd - 1]).toBe('>'.charCodeAt(0));
        });

        it('rejects a file with a changed byte inside the signed range', async () => {
            const { signed } = await signFully(letter);
            const tampered = Buffer.from(signed);
            // the signing date in /M sits inside the signed range
            const at = tampered.indexOf('D:20261009');
            expect(at).toBeGreaterThan(0);
            tampered[at + 9] = '8'.charCodeAt(0);

            const result = validate(tampered);
            expect(result.valid).toBe(false);
            expect(result.byteRangeCoversFile).toBe(true);
            expect(result.reasons.join(' ')).toMatch(/file was changed after signing/);
        });

        it('rejects a file with bytes appended after signing', async () => {
            const { signed } = await signFully(letter);
            const result = validate(
                Buffer.concat([signed, Buffer.from('\n%% appended\n')]),
            );
            expect(result.valid).toBe(false);
            expect(result.byteRangeCoversFile).toBe(false);
        });

        it('rejects a corrupted signature value', async () => {
            const { signed } = await signFully(letter);
            const [range] = readByteRanges(signed);
            const cms = readCms(signed);
            const sig = Buffer.from(cms.signerInfos[0].signature.valueBlock.valueHexView);
            // Flip a hex digit inside the encoded signature.
            const hex = signed
                .subarray(range.contentsStart + 1, range.contentsEnd - 1)
                .toString('latin1');
            const sigHex = sig.toString('hex').toUpperCase();
            const at = hex.indexOf(sigHex);
            expect(at).toBeGreaterThan(0);
            const tampered = Buffer.from(signed);
            const position = range.contentsStart + 1 + at + 10;
            tampered[position] = tampered[position] === 0x30 ? 0x31 : 0x30;

            const result = validate(tampered);
            expect(result.valid).toBe(false);
            expect(result.reasons.join(' ')).toMatch(/does not verify/);
        });

        it('reports an unsigned PDF as invalid', () => {
            const result = validate(letter);
            expect(result.valid).toBe(false);
            expect(result.reasons).toEqual(['The PDF has no signature.']);
        });
    });

    describe('CMS profile', () => {
        it('signs only contentType, messageDigest and signingCertificateV2, without signingTime', async () => {
            const { prepared, signed } = await signFully(letter);

            const topLevel = asn1js.fromBER(ab(prepared.signedAttrsDer)).result as asn1js.Set;
            expect(prepared.signedAttrsDer[0]).toBe(0x31);
            const oids = topLevel.valueBlock.value.map(
                (attr: any) => attr.valueBlock.value[0].valueBlock.toString(),
            );
            expect(oids).toEqual([
                '1.2.840.113549.1.9.3',
                '1.2.840.113549.1.9.4',
                '1.2.840.113549.1.9.16.2.47',
            ]);
            expect(oids).not.toContain('1.2.840.113549.1.9.5'); // signingTime

            // The same attributes, in the [0] IMPLICIT form, sit in the SignerInfo.
            const cms = readCms(signed);
            const embedded = Buffer.from(
                cms.signerInfos[0].signedAttrs!.toSchema().toBER(),
            );
            embedded[0] = 0x31;
            expect(embedded.equals(prepared.signedAttrsDer)).toBe(true);
            expect(
                cms.signerInfos[0].signedAttrs!.attributes.map((a) => a.type),
            ).toEqual(oids);
        });

        it('binds the signer certificate through signingCertificateV2 with the correct hash', async () => {
            const { prepared } = await signFully(letter);
            const topLevel = asn1js.fromBER(ab(prepared.signedAttrsDer)).result as asn1js.Set;
            const v2 = topLevel.valueBlock.value[2] as asn1js.Sequence;
            // Attribute -> values SET -> SigningCertificateV2 -> certs -> ESSCertIDv2
            const essCertId = (v2.valueBlock.value[1] as any).valueBlock.value[0]
                .valueBlock.value[0].valueBlock.value[0];
            const certHash = Buffer.from(essCertId.valueBlock.value[0].valueBlock.valueHexView);

            expect(certHash.equals(sha256(identity.chainDer[0]))).toBe(true);
            // issuerSerial carries the issuer name and the serial number of the signer
            const issuerSerial = essCertId.valueBlock.value[1];
            expect(issuerSerial.valueBlock.value).toHaveLength(2);
            const serial = Buffer.from(issuerSerial.valueBlock.value[1].valueBlock.valueHexView);
            expect(serial.toString('hex').toUpperCase()).toBe(identity.leafSerialHex);
        });

        it('hashes the attributes it returns and derives the check code from that hash', async () => {
            const { prepared } = await signFully(letter);
            expect(prepared.hashToSign.equals(sha256(prepared.signedAttrsDer))).toBe(true);
            expect(prepared.checkCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
            expect(prepared.checkCode.replace('-', '')).toBe(
                prepared.hashToSign.toString('hex').slice(0, 8).toUpperCase(),
            );
        });

        it('puts the whole chain from the store in the certificate set', async () => {
            const { signed } = await signFully(letter);
            const cms = readCms(signed);
            expect(cms.certificates).toHaveLength(3);
        });
    });

    describe('finalize refuses to build a file that would not validate', () => {
        it('rejects a signature made by another key', async () => {
            const other = await createTestIdentity('Ktoś Inny');
            const prepared = await prepare(letter, identity.chainDer, 'none', { now: NOW });
            const wrong = softwareCardSign(prepared.hashToSign, other.privateKey);
            expect(() =>
                finalize(prepared.preparedPdf, prepared.signedAttrsDer, wrong, identity.chainDer),
            ).toThrow(expect.objectContaining({ code: 'SIGNATURE_MISMATCH' }));
        });

        it('rejects a signature of a different hash', async () => {
            const prepared = await prepare(letter, identity.chainDer, 'none', { now: NOW });
            const wrong = softwareCardSign(sha256(Buffer.from('something else')), identity.privateKey);
            expect(() =>
                finalize(prepared.preparedPdf, prepared.signedAttrsDer, wrong, identity.chainDer),
            ).toThrow(expect.objectContaining({ code: 'SIGNATURE_MISMATCH' }));
        });

        it('rejects attributes that belong to another prepared PDF', async () => {
            const first = await prepare(letter, identity.chainDer, 'none', { now: NOW });
            const second = await prepare(
                letter,
                identity.chainDer,
                'none',
                { now: new Date('2026-10-10T08:00:00Z') },
            );
            const signature = softwareCardSign(second.hashToSign, identity.privateKey);
            expect(() =>
                finalize(first.preparedPdf, second.signedAttrsDer, signature, identity.chainDer),
            ).toThrow(expect.objectContaining({ code: 'INVALID_PREPARED_PDF' }));
        });

        it('rejects a PDF that is not a prepared one', () => {
            expect(() =>
                finalize(letter, Buffer.alloc(3), Buffer.alloc(256), identity.chainDer),
            ).toThrow(expect.objectContaining({ code: 'INVALID_PREPARED_PDF' }));
        });
    });

    describe('determinism', () => {
        it('gives byte-identical prepared output for the same inputs and clock', async () => {
            const a = await prepare(letter, identity.chainDer, 'letterClosing', { now: NOW });
            const b = await prepare(letter, identity.chainDer, 'letterClosing', { now: NOW });
            expect(a.preparedPdf.equals(b.preparedPdf)).toBe(true);
            expect(a.signedAttrsDer.equals(b.signedAttrsDer)).toBe(true);
            expect(a.checkCode).toBe(b.checkCode);
        });

        it('changes with the clock, because the date is part of the appearance and /M', async () => {
            const a = await prepare(letter, identity.chainDer, 'letterClosing', { now: NOW });
            const b = await prepare(letter, identity.chainDer, 'letterClosing', {
                now: new Date(NOW.getTime() + 1000),
            });
            expect(a.checkCode).not.toBe(b.checkCode);
        });

        it('prints the date in Warsaw time regardless of the server zone', () => {
            expect(formatSigningDate(NOW, 'Europe/Warsaw')).toBe('2026-10-09 12:15:30');
            expect(formatSigningDate(new Date('2026-01-05T23:59:59Z'), 'Europe/Warsaw')).toBe(
                '2026-01-06 00:59:59',
            );
            expect(formatSigningDate(new Date('2026-01-05T23:00:00Z'), 'UTC')).toBe(
                '2026-01-05 23:00:00',
            );
        });
    });

    describe('visible appearance', () => {
        it('has no widget appearance in graphic-less mode, and still validates', async () => {
            const { signed, prepared } = await signFully(letter, 'none');
            const found = await widgets(signed);

            expect(prepared.placement.source).toBe('none');
            expect(found).toEqual([{ rect: [0, 0, 0, 0], hasAppearance: false, page: 1 }]);
            expect(validate(signed).valid).toBe(true);
        });

        it('adds a widget with an appearance at the letter closing', async () => {
            const { signed, prepared } = await signFully(letter);
            const found = await widgets(signed);

            expect(prepared.placement.source).toBe('letter_closing');
            expect(found).toHaveLength(1);
            expect(found[0].hasAppearance).toBe(true);
            const [x0, y0, x1, y1] = found[0].rect;
            expect(x1 - x0).toBeCloseTo(0.28 * 595, 1);
            expect(y1 - y0).toBeCloseTo(0.06 * 842, 1);
            expect(validate(signed).valid).toBe(true);
        });

        it('renders a Polish name: font with the diacritics is embedded, nothing throws', async () => {
            const { signed } = await signFully(letter);
            const doc = await PDFDocument.load(signed);
            const fontNames: string[] = [];
            const toUnicode: string[] = [];
            doc.context.enumerateIndirectObjects().forEach(([, object]) => {
                if (object instanceof PDFDict && object.get(PDFName.of('Type')) === PDFName.of('Font')) {
                    fontNames.push(String(object.get(PDFName.of('BaseFont'))));
                }
                if (object instanceof PDFRawStream) {
                    const text = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
                    if (text.includes('beginbfchar') || text.includes('beginbfrange')) {
                        toUnicode.push(text.toUpperCase());
                    }
                }
            });

            expect(fontNames.join(' ')).toContain('OpenSans');
            expect(fontNames.join(' ')).toContain('OpenSans-Bold');
            // The name is set in the bold subset; every letter must be mapped to its code point.
            const allMappings = toUnicode.join('\n');
            for (const letterInName of 'ŻęśŁ') {
                const hex = letterInName.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
                expect(allMappings).toContain(`<${hex}>`);
            }
            // and the font programs themselves are embedded, not referenced: the two appearance
            // fonts plus the font of the fixture page
            const fontFiles = doc.context
                .enumerateIndirectObjects()
                .filter(
                    ([, o]) => o instanceof PDFDict && o.has(PDFName.of('FontFile2')),
                );
            expect(fontFiles.length).toBe(3);
        });

        it('embeds font subsets whose glyphs are all intact (a broken subset extracts fine but renders blanks)', async () => {
            const { signed } = await signFully(letter);
            const doc = await PDFDocument.load(signed);
            const broken: string[] = [];
            let checkedFonts = 0;
            doc.context.enumerateIndirectObjects().forEach(([, object]) => {
                if (
                    !(object instanceof PDFDict) ||
                    object.get(PDFName.of('Subtype')) !== PDFName.of('Type0')
                ) {
                    return;
                }
                const descendant = object.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
                const fontFile = descendant
                    .lookup(PDFName.of('FontDescriptor'), PDFDict)
                    .lookup(PDFName.of('FontFile2')) as PDFRawStream;
                const font = fontkit.create(Buffer.from(decodePDFRawStream(fontFile).decode()));
                const toUnicode = object.lookup(PDFName.of('ToUnicode')) as PDFRawStream;
                const cmap = Buffer.from(decodePDFRawStream(toUnicode).decode()).toString('latin1');
                const mappings = Array.from(cmap.matchAll(/<([0-9A-F]{4})>\s+<([0-9A-F]{4})>/gi));
                checkedFonts++;
                for (const [, cid, unicode] of mappings) {
                    if (parseInt(unicode, 16) === 0x20) continue;
                    try {
                        const glyph = font.getGlyph(parseInt(cid, 16));
                        if (!glyph.path || (glyph.path as any).commands.length === 0) {
                            broken.push(String.fromCharCode(parseInt(unicode, 16)));
                        }
                    } catch (e) {
                        broken.push(String.fromCharCode(parseInt(unicode, 16)));
                    }
                }
            });
            expect(checkedFonts).toBe(3); // fixture page font + the two appearance fonts
            expect(broken).toEqual([]);
        });

        it('shrinks and shortens a very long name instead of overflowing', async () => {
            const longName = 'Maria Magdalena Przemysława Kowalska-Nowakowska-Wiśniewska';
            const longIdentity = await createTestIdentity(longName);
            const prepared = await prepare(letter, longIdentity.chainDer, 'letterClosing', {
                now: NOW,
            });
            expect(prepared.signerName).toBe(longName);
            const signature = softwareCardSign(prepared.hashToSign, longIdentity.privateKey);
            const signed = finalize(
                prepared.preparedPdf,
                prepared.signedAttrsDer,
                signature,
                longIdentity.chainDer,
            );
            expect(validate(signed).valid).toBe(true);
        });
    });

    describe('inputs that must be refused', () => {
        it('refuses a PDF that already carries a signature', async () => {
            const { signed } = await signFully(letter);
            await expect(
                prepare(signed, identity.chainDer, 'none', { now: NOW }),
            ).rejects.toMatchObject({ code: 'ALREADY_SIGNED' });
        });

        it('refuses bytes that are not a PDF', async () => {
            await expect(
                prepare(Buffer.from('not a pdf'), identity.chainDer, 'none'),
            ).rejects.toMatchObject({ code: 'INVALID_PDF' });
        });

        it('refuses an empty chain and a broken certificate', async () => {
            await expect(prepare(letter, [], 'none')).rejects.toMatchObject({
                code: 'INVALID_CERTIFICATE',
            });
            await expect(
                prepare(letter, [Buffer.from('garbage')], 'none'),
            ).rejects.toBeInstanceOf(SigningError);
        });
    });
});
