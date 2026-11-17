import { createHash, generateKeyPairSync, sign as cryptoSign, webcrypto } from 'crypto';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { SigningError, finalize, prepare, validate } from '..';
import { formatSigningDate } from '../SignatureAppearance';
import * as cmsSigning from '../CmsSigning';
import * as layout from '../PdfSignatureLayout';
import { BYTERANGE_PLACEHOLDER_VALUE, patchByteRange, readByteRanges, readLastTrailer, signedBytes } from '../PdfSignatureLayout';
import * as pageAnalyzer from '../PdfPageAnalyzer';
import { loadPdfjs } from '../PdfPageAnalyzer';
import { SignaturePlacement } from '../SigningTypes';
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
        it('prepares a further signature without changing the signed revision', async () => {
            const { signed } = await signFully(letter);
            const prepared = await prepare(signed, identity.chainDer, 'none', { now: NOW });
            expect(prepared.preparedPdf.subarray(0, signed.length).equals(signed)).toBe(true);
            expect(readByteRanges(prepared.preparedPdf)).toHaveLength(2);
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


describe('further PDF signatures', () => {
    const name = PDFName.of;
    let first: TestIdentity, second: TestIdentity, unsigned: Buffer;

    beforeAll(async () => {
        first = await createTestIdentity('Signer One');
        second = await createTestIdentity('Signer Two');
        unsigned = await makeFixture({ lines: [{ x: 60, y: 760, text: 'Test document' }] });
    });

    async function sign(pdf: Buffer, identity = first, placement: SignaturePlacement = 'none') {
        const prepared = await prepare(pdf, identity.chainDer, placement, { now: NOW });
        const result = finalize(prepared.preparedPdf, prepared.signedAttrsDer,
            softwareCardSign(prepared.hashToSign, identity.privateKey), identity.chainDer);
        return { prepared, signed: result };
    }

    interface FixtureOptions {
        stream?: boolean;
        directForm?: boolean;
        indirectFields?: boolean;
        indirectAnnots?: boolean;
        sparse?: boolean;
        collision?: boolean;
        edit?: (doc: PDFDocument, form: PDFDict, field: PDFDict, signature: PDFDict) => void;
    }

    /** Create the entire first revision before signing it; never save() an already signed PDF. */
    async function signedFixture(options: FixtureOptions = {}) {
        const doc = await PDFDocument.create();
        const page = doc.addPage([595, 842]);
        const c = doc.context;
        const signature = c.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'ETSI.CAdES.detached',
            ByteRange: [0, BYTERANGE_PLACEHOLDER_VALUE, BYTERANGE_PLACEHOLDER_VALUE, BYTERANGE_PLACEHOLDER_VALUE],
            Contents: PDFHexString.of('0'.repeat(16384)), Name: PDFString.of('Signer One') });
        // Nonzero generation keeps Contents uncompressed, while catalog/form go into ObjStm.
        const sigRef = PDFRef.of(c.nextRef().objectNumber, 1);
        c.assign(sigRef, signature);
        const field = c.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('ENVI_Podpis_1'),
            V: sigRef, P: page.ref, Rect: [0, 0, 0, 0] });
        const fieldRef = c.register(field);
        const fields = c.obj([fieldRef]);
        if (options.collision) {
            const child = c.register(c.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFHexString.fromText('Child'), Rect: [0, 0, 0, 0], P: page.ref }));
            const parent = c.register(c.obj({ T: PDFHexString.fromText('ENVI_Podpis_2'), Kids: [child] }));
            c.lookup(child, PDFDict).set(name('Parent'), parent);
            fields.push(parent);
        }
        const annots = c.obj([fieldRef]);
        page.node.set(name('Annots'), options.indirectAnnots ? c.register(annots) : annots);
        const form = c.obj({ Fields: options.indirectFields ? c.register(fields) : fields, SigFlags: 8 });
        doc.catalog.set(name('AcroForm'), options.directForm ? form : c.register(form));
        c.trailerInfo.ID = c.obj([PDFHexString.of('aabbccdd'), PDFHexString.of('11223344')]);
        doc.catalog.set(name('Metadata'), c.register(c.stream('<x:xmpmeta>original XMP</x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' })));
        options.edit?.(doc, form, field, signature);
        if (options.sparse) c.largestObjectNumber = 500;
        const saved = Buffer.from(await doc.save({ useObjectStreams: !!options.stream, updateFieldAppearances: false }));
        const patched = patchByteRange(saved, 16384);
        const attrs = cmsSigning.buildSignedAttributes(cmsSigning.readSignerCertificate(first.chainDer), cmsSigning.sha256(signedBytes(patched.pdf, patched.range)));
        return finalize(patched.pdf, attrs.der, softwareCardSign(attrs.hash, first.privateKey), first.chainDer);
    }

    async function fieldNames(pdf: Buffer): Promise<string[]> {
        const loading = loadPdfjs().getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
        const doc = await loading.promise;
        try { return Object.keys(await doc.getFieldObjects()); }
        finally { await doc.destroy(); }
    }

    async function expectRefusal(pdf: Buffer, code: string, placement: SignaturePlacement = 'none') {
        const hash = jest.spyOn(cmsSigning, 'sha256');
        const attrs = jest.spyOn(cmsSigning, 'buildSignedAttributes');
        try {
            await expect(prepare(pdf, second.chainDer, placement, { now: NOW })).rejects.toMatchObject({ code });
            expect(hash).not.toHaveBeenCalled();
            expect(attrs).not.toHaveBeenCalled();
        } finally { hash.mockRestore(); attrs.mockRestore(); }
    }

    describe('append-only signing', () => {
        it.each([
            ['none', '302f2d90ea5e2ced7c8858c7c7c098e831a1dcc4b3d0c3849a0181f5c2c66ee8'],
            ['graphic', 'cd8c0fb337530be9b554fd3e2e5b63c122bf549a1acea63c91262c0a780564b5'],
        ])('keeps unsigned prepared bytes identical to HEAD with %s', async (mode, expected) => {
            const doc = await PDFDocument.create();
            doc.addPage([595, 842]);
            doc.setCreationDate(NOW);
            doc.setModificationDate(NOW);
            const input = Buffer.from(await doc.save({ useObjectStreams: false }));
            expect(input.includes('/ByteRange')).toBe(false);
            const placement = mode === 'none' ? 'none' : { page: 1, rect: { x: 400, y: 50, width: 160, height: 50 } };
            const result = await prepare(input, first.chainDer, placement, { now: NOW });
            // SHA-256 of prepare() at HEAD 658d0ab, checked against the same fixture and PKI in scratch.
            expect(sha256(result.preparedPdf).toString('hex')).toBe(expected);
        });

        it.each(['raw token only', 'raw indirect ByteRange', 'compressed ByteRange', 'compressed Type Sig', 'compressed SigFlags'])
        ('preserves the prefix for an unrecognised signature hint: %s', async (hint) => {
            const doc = await PDFDocument.create();
            const page = doc.addPage([595, 842]);
            const c = doc.context;
            const fields = c.obj([]);
            if (hint.includes('token only')) {
                c.register(c.obj({ Note: PDFString.of('/ByteRange') }));
            } else if (!hint.includes('SigFlags')) {
                const sig = c.obj(hint.includes('ByteRange') ? { ByteRange: c.register(c.obj([0, 1, 2, 3])) } : { Type: 'Sig' });
                const field = c.register(c.obj({ FT: 'Sig', T: PDFString.of('Foreign'), V: c.register(sig),
                    Subtype: 'Widget', Rect: [0, 0, 0, 0], P: page.ref }));
                fields.push(field);
                page.node.set(name('Annots'), c.obj([field]));
            }
            doc.catalog.set(name('AcroForm'), c.register(c.obj(hint.includes('SigFlags') ?
                { Fields: fields, SigFlags: 1 } : { Fields: fields })));
            const input = Buffer.from(await doc.save({ useObjectStreams: !hint.startsWith('raw'), updateFieldAppearances: false }));
            expect(readByteRanges(input)).toHaveLength(0);
            if (!hint.startsWith('raw')) expect(input.includes('/ByteRange')).toBe(false);
            const result = await sign(input, second);
            expect(result.prepared.preparedPdf.subarray(0, input.length).equals(input)).toBe(true);
            expect(result.signed.subarray(0, input.length).equals(input)).toBe(true);
            expect(validate(result.signed).signatures.slice(-1)[0].valid).toBe(true);
        });

        it.each([false, true])('lists exact object offsets in the appended xref (stream=%s)', async (stream) => {
            const one = await signedFixture({ stream, sparse: true, indirectFields: true, indirectAnnots: true });
            const two = (await sign(one, second, 'lastPageCorner')).signed;
            const text = two.toString('latin1');
            const offset = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)![1]);
            const check = (number: number, generation: number, at: number) => {
                expect(at).toBeGreaterThanOrEqual(one.length);
                expect(text.slice(at)).toMatch(new RegExp(`^${number} ${generation} obj\\b`));
            };
            let checked = 0;
            if (stream) {
                const section = text.slice(offset);
                const widths = /\/W\s*\[([^\]]+)\]/.exec(section)![1].trim().split(/\s+/).map(Number);
                const index = /\/Index\s*\[([^\]]+)\]/.exec(section)![1].trim().split(/\s+/).map(Number);
                const length = Number(/\/Length\s+(\d+)/.exec(section)![1]);
                expect(section).not.toMatch(/\/Filter\b/);
                const start = offset + section.indexOf('stream\n') + 7;
                const bytes = two.subarray(start, start + length);
                let cursor = 0;
                for (let i = 0; i < index.length; i += 2) {
                    for (let n = index[i]; n < index[i] + index[i + 1]; n++) {
                        const values = widths.map((width, column) => {
                            let value = width === 0 && column === 0 ? 1 : 0;
                            for (let b = 0; b < width; b++) value = value * 256 + bytes[cursor++];
                            return value;
                        });
                        expect(values[0]).toBe(1);
                        check(n, values[2], values[1]);
                        checked++;
                    }
                }
                expect(cursor).toBe(length);
            } else {
                const lines = text.slice(offset).split(/\r?\n/);
                expect(lines.shift()).toBe('xref');
                while (lines[0] !== 'trailer') {
                    const [first, count] = lines.shift()!.trim().split(/\s+/).map(Number);
                    for (let i = 0; i < count; i++) {
                        const entry = /^(\d{10}) (\d{5}) ([nf])/.exec(lines.shift()!)!;
                        if (entry[3] === 'n') { check(first + i, Number(entry[2]), Number(entry[1])); checked++; }
                    }
                }
            }
            expect(checked).toBeGreaterThan(3);
        });

        it.each(['none', 'lastPageCorner'] as const)('adds signer two with graphic %s and preserves the prefix after prepare/finalize', async (placement) => {
            const one = (await sign(unsigned)).signed;
            const two = await sign(one, second, placement);
            expect(two.prepared.preparedPdf.subarray(0, one.length).equals(one)).toBe(true);
            expect(two.signed.subarray(0, one.length).equals(one)).toBe(true);
            const result = validate(two.signed);
            expect(result.reasons).toEqual([]);
            expect(result.valid).toBe(true);
            expect(result.signerName).toBe('Signer Two');
            expect(result.certSerial).toBe(second.leafSerialHex);
            expect(result.chainDer[0].equals(second.chainDer[0])).toBe(true);
            expect(result.signatures.map((s) => [s.valid, s.signerName, s.revisionEnd, s.byteRangeCoversFile]))
                .toEqual([[true, 'Signer One', one.length, false], [true, 'Signer Two', two.signed.length, true]]);
            expect((await widgets(two.signed)).map((w) => w.hasAppearance)).toEqual([false, placement !== 'none']);
        });

        it('adds a third signature on top of two', async () => {
            const one = (await sign(unsigned)).signed;
            const two = (await sign(one, second)).signed;
            const three = await sign(two);
            expect(three.prepared.preparedPdf.subarray(0, two.length).equals(two)).toBe(true);
            expect(three.signed.subarray(0, two.length).equals(two)).toBe(true);
            expect(validate(three.signed).signatures.map((s) => s.valid)).toEqual([true, true, true]);
            expect(await fieldNames(three.signed)).toEqual(['ENVI_Podpis_1', 'ENVI_Podpis_2', 'ENVI_Podpis_3']);
        });

        it('preserves an existing graphic when adding a second graphic elsewhere', async () => {
            const one = (await sign(unsigned, first, { page: 1, rect: { x: 80, y: 100, width: 160, height: 50 } })).signed;
            const two = await sign(one, second, { page: 1, rect: { x: 80, y: 200, width: 160, height: 50 } });
            expect(two.signed.subarray(0, one.length).equals(one)).toBe(true);
            expect(await widgets(two.signed)).toEqual([
                { page: 1, rect: [80, 100, 240, 150], hasAppearance: true },
                { page: 1, rect: [80, 200, 240, 250], hasAppearance: true },
            ]);
            expect(validate(two.signed).valid).toBe(true);
        });

        it.each(['none', 'lastPageCorner'] as const)('keeps PDF, attributes, hash and check code deterministic with %s', async (placement) => {
            const one = await signedFixture({ stream: true });
            const a = await prepare(one, second.chainDer, placement, { now: NOW });
            const b = await prepare(one, second.chainDer, placement, { now: NOW });
            expect(a.preparedPdf.equals(b.preparedPdf)).toBe(true);
            expect(a.signedAttrsDer.equals(b.signedAttrsDer)).toBe(true);
            expect(a.hashToSign.equals(b.hashToSign)).toBe(true);
            expect(a.checkCode).toBe(b.checkCode);
        });

        const forms: FixtureOptions[] = [];
        for (const directForm of [false, true]) for (const indirectFields of [false, true])
            for (const indirectAnnots of [false, true]) forms.push({ directForm, indirectFields, indirectAnnots });
        it.each(forms)('handles form/array ownership %j with stream xref and compressed catalog/AcroForm', async (options) => {
            const one = await signedFixture({ ...options, stream: true, sparse: true, collision: true });
            const oldTrailer = readLastTrailer(one);
            expect(oldTrailer.stream).toBe(true);
            expect(one.toString('latin1')).toContain('/ObjStm');
            expect(one.toString('latin1')).not.toContain('/Type /Catalog');
            const two = await sign(one, second);
            expect(two.signed.subarray(0, one.length).equals(one)).toBe(true);
            expect(validate(two.signed).signatures.map((s) => s.valid)).toEqual([true, true]);
            const last = readLastTrailer(two.signed);
            expect(last.stream).toBe(true);
            expect(last.offset).toBeGreaterThan(one.length);
            expect(last.dict.get(name('Prev'))?.toString()).toBe(String(oldTrailer.offset));
            expect(last.dict.has(name('Filter'))).toBe(false);
            expect(last.size).toBeGreaterThan(oldTrailer.size);
            expect(two.signed.subarray(one.length).toString('latin1')).toMatch(new RegExp(`${oldTrailer.size} 0 obj`));
            const names = await fieldNames(two.signed);
            expect(names).toContain('ENVI_Podpis_3');
            expect(names).toContain('ENVI_Podpis_2.Child');
            const doc = await PDFDocument.load(two.signed, { updateMetadata: false });
            const form = doc.catalog.lookup(name('AcroForm'), PDFDict);
            expect(form.lookup(name('SigFlags'), PDFNumber).asNumber()).toBe(11);
            expect(form.get(name('Fields')) instanceof PDFRef).toBe(!!options.indirectFields);
            expect(doc.getPage(0).node.get(name('Annots')) instanceof PDFRef).toBe(!!options.indirectAnnots);
            expect(doc.catalog.get(name('AcroForm')) instanceof PDFRef).toBe(!options.directForm);
            expect(last.dict.get(name('Info'))?.toString()).toBe(oldTrailer.dict.get(name('Info'))?.toString());
            expect((last.dict.get(name('ID')) as PDFArray).get(0).toString()).toBe('<aabbccdd>');
            expect(two.signed.subarray(one.length).toString('latin1')).not.toMatch(/original XMP|\/Producer|\/ModDate/);
        });

        it('keeps a classic xref table, handles sparse Size and preserves a nonzero generation', async () => {
            const one = await signedFixture({ sparse: true, indirectFields: true, indirectAnnots: true,
                edit: (doc, form) => {
                    const c = doc.context;
                    const old = doc.catalog.get(name('AcroForm')) as PDFRef;
                    c.delete(old);
                    doc.catalog.set(name('AcroForm'), PDFRef.of(old.objectNumber, 7));
                    c.assign(PDFRef.of(old.objectNumber, 7), form);
                } });
            const two = await sign(one, second);
            expect(readLastTrailer(two.signed).stream).toBe(false);
            expect(two.signed.subarray(one.length).toString('latin1')).toMatch(/\d+ 7 obj/);
            expect(validate(two.signed).valid).toBe(true);
            expect(two.signed.subarray(0, one.length).equals(one)).toBe(true);
        });

        it.each(['AcroForm', 'Fields', 'Annots'])('creates a missing %s without changing the original prefix', async (key) => {
            const one = await signedFixture({ edit: (doc, form) => {
                if (key === 'AcroForm') doc.catalog.delete(name(key));
                else if (key === 'Fields') form.delete(name(key));
                else doc.getPage(0).node.delete(name(key));
            } });
            const two = await sign(one, second);
            expect(two.signed.subarray(0, one.length).equals(one)).toBe(true);
            expect(validate(two.signed).signatures.map((s) => s.valid)).toEqual([true, true]);
            expect(await fieldNames(two.signed)).toContain(key === 'Annots' ? 'ENVI_Podpis_2' : 'ENVI_Podpis_1');
        });

        it('rewrites only the indirect arrays when SigFlags already has both bits', async () => {
            const one = await signedFixture({ indirectFields: true, indirectAnnots: true,
                edit: (_doc, form) => form.set(name('SigFlags'), PDFNumber.of(3)) });
            const original = await PDFDocument.load(one, { updateMetadata: false });
            const formRef = original.catalog.get(name('AcroForm')) as PDFRef;
            const form = original.context.lookup(formRef, PDFDict);
            const fieldsRef = form.get(name('Fields')) as PDFRef;
            const annotsRef = original.getPage(0).node.get(name('Annots')) as PDFRef;
            const two = await sign(one, second);
            const increment = two.signed.subarray(one.length).toString('latin1');
            for (const ref of [fieldsRef, annotsRef]) expect(increment).toMatch(new RegExp(`(?:^|\\n)${ref.objectNumber} ${ref.generationNumber} obj`));
            for (const ref of [formRef, original.getPage(0).ref, original.context.trailerInfo.Root as PDFRef]) {
                expect(increment).not.toMatch(new RegExp(`(?:^|\\n)${ref.objectNumber} ${ref.generationNumber} obj`));
            }
            expect(validate(two.signed).valid).toBe(true);
        });

        it('allows an unsigned DSS/LTV revision tail and does not require the existing signature to cover the input', async () => {
            const one = (await sign(unsigned)).signed;
            const old = readLastTrailer(one);
            const tail = Buffer.from(`\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size ${old.size} /Root ${old.dict.get(name('Root'))} /Prev ${old.offset} >>\nstartxref\n${one.length + 1}\n%%EOF\n`);
            const withTail = Buffer.concat([one, tail]);
            const two = (await sign(withTail, second)).signed;
            expect(two.subarray(0, withTail.length).equals(withTail)).toBe(true);
            expect(validate(two).valid).toBe(true);
        });

        it('does not refuse a Linearized marker and leaves it in the preserved prefix', async () => {
            const one = await signedFixture({ edit: (doc) => {
                doc.context.register(doc.context.obj({ Linearized: 1, L: 0 }));
            } });
            const two = await sign(one, second);
            expect(two.signed.subarray(0, one.length).equals(one)).toBe(true);
            expect(validate(two.signed).valid).toBe(true);
        });

        it('patches only the new signature object even if the original contains an empty placeholder', async () => {
            const old = await prepare(unsigned, first.chainDer, 'none', { now: NOW });
            const next = await sign(old.preparedPdf, second);
            expect(next.signed.subarray(0, old.preparedPdf.length).equals(old.preparedPdf)).toBe(true);
            expect(validate(next.signed).signatures.map((s) => s.valid)).toEqual([false, true]);
        });

        it('asserts the prefix invariant before a signing hash is produced', async () => {
            const one = (await sign(unsigned)).signed;
            const realPatch = layout.patchByteRange;
            jest.spyOn(layout, 'patchByteRange').mockImplementation((...args) => {
                const result = realPatch(...args);
                result.pdf[one.indexOf('D:20261009') + 9] = '8'.charCodeAt(0);
                return result;
            });
            await expectRefusal(one, 'PDF_INCREMENTAL_UNSUPPORTED');
        });

        it.each(['page count', 'reachable field', 'wrong field reference'])('refuses a failed pdfjs self-check (%s) before the signing hash', async (failure) => {
            const one = (await sign(unsigned)).signed;
            const destroy = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(pageAnalyzer, 'loadPdfjs').mockReturnValue({ getDocument: ({ data }: { data: Uint8Array }) => ({
                promise: PDFDocument.load(data, { updateMetadata: false }).then((doc) => {
                    const fields = doc.catalog.lookup(name('AcroForm'), PDFDict).lookup(name('Fields'), PDFArray);
                    const ref = fields.get(fields.size() - 1) as PDFRef;
                    return { numPages: failure === 'page count' ? 2 : 1,
                        getFieldObjects: async () => failure === 'reachable field' ? {} : {
                            ENVI_Podpis_2: [{ type: 'signature', id: failure === 'wrong field reference' ? '1R' : `${ref.objectNumber}R` }],
                        }, destroy };
                }),
            }) });
            await expectRefusal(one, 'PDF_INCREMENTAL_UNSUPPORTED');
            expect(destroy).toHaveBeenCalledTimes(1);
        });
    });

    describe('incremental preflight refusals before a signing hash exists', () => {
        it.each([1, 2, 3])('refuses DocMDP certification P=%i with PDF_LOCKED', async (p) => {
            const one = await signedFixture({ edit: (doc, _form, _field, sig) => {
                sig.set(name('Reference'), doc.context.obj([{ TransformMethod: 'DocMDP', TransformParams: { P: p } }]));
                doc.catalog.set(name('Perms'), doc.context.obj({ DocMDP: doc.context.getObjectRef(sig)! }));
            } });
            await expectRefusal(one, 'PDF_LOCKED');
        });
        it('refuses DocMDP in Perms even without a Reference transform', async () => {
            const one = await signedFixture({ edit: (doc, _form, _field, sig) => {
                doc.catalog.set(name('Perms'), doc.context.obj({ DocMDP: doc.context.getObjectRef(sig)! }));
            } });
            await expectRefusal(one, 'PDF_LOCKED');
        });
        it.each(['All', 'Include', 'Exclude'])('refuses any FieldMDP transform (%s)', async (action) => {
            const one = await signedFixture({ edit: (doc, _form, _field, sig) => {
                sig.set(name('Reference'), doc.context.obj([{ TransformMethod: 'FieldMDP', TransformParams: { Action: action, Fields: ['Other'] } }]));
            } });
            await expectRefusal(one, 'PDF_LOCKED');
        });
        it('refuses Lock on an already signed field', async () => {
            const one = await signedFixture({ edit: (doc, _form, field) => field.set(name('Lock'), doc.context.obj({ Action: 'All' })) });
            await expectRefusal(one, 'PDF_LOCKED');
        });
        it('refuses Lock on a widget inheriting its signed V from the parent field', async () => {
            const one = await signedFixture({ edit: (doc, _form, field) => {
                const c = doc.context;
                const widget = c.register(c.obj({ Type: 'Annot', Subtype: 'Widget', Rect: [0, 0, 0, 0],
                    P: doc.getPage(0).ref, Parent: c.getObjectRef(field)!, Lock: { Action: 'All' } }));
                field.delete(name('Subtype'));
                field.set(name('Kids'), c.obj([widget]));
                doc.getPage(0).node.set(name('Annots'), c.obj([widget]));
            } });
            await expectRefusal(one, 'PDF_LOCKED');
        });
        it('allows a Lock on an unsigned field', async () => {
            const one = await signedFixture({ edit: (doc, form) => {
                form.lookup(name('Fields'), PDFArray).push(doc.context.register(doc.context.obj({ FT: 'Sig', T: PDFString.of('Unsigned'), Lock: { Action: 'All' } })));
            } });
            expect(validate((await sign(one, second)).signed).valid).toBe(true);
        });
        it('refuses hybrid XRefStm in the last trailer', async () => {
            const one = await signedFixture();
            const hybrid = Buffer.from(one.toString('latin1').replace(/trailer\s*<</, 'trailer\n<< /XRefStm 1'), 'latin1');
            await expectRefusal(hybrid, 'PDF_INCREMENTAL_UNSUPPORTED');
        });
        it('refuses XFA without calling getForm()', async () => {
            const one = await signedFixture({ edit: (doc, form) => form.set(name('XFA'), doc.context.obj(['template', PDFString.of('data')])) });
            await expectRefusal(one, 'PDF_INCREMENTAL_UNSUPPORTED');
        });
        it.each(['none', 'letterClosing', 'lastPageCorner', 'explicit'])('checks widget overlap for placement %s', async (mode) => {
            const one = await signedFixture({ edit: (doc, _form, field) => field.set(name('Rect'), doc.context.obj([0, 0, 595, 842])) });
            const placement = mode === 'explicit' ? { page: 1, rect: { x: 100, y: 100, width: 160, height: 50 } } : mode as SignaturePlacement;
            if (mode === 'none') expect(validate((await sign(one, second, placement)).signed).valid).toBe(true);
            else await expectRefusal(one, 'SIGNATURE_WIDGET_OVERLAP', placement);
        });
        it('ignores zero-area widgets when a graphic is requested', async () => {
            const one = await signedFixture();
            expect(validate((await sign(one, second, 'lastPageCorner')).signed).valid).toBe(true);
        });
        it('refuses encryption in the last trailer', async () => {
            const one = await signedFixture();
            await expectRefusal(Buffer.from(one.toString('latin1').replace(/trailer\s*<</, 'trailer\n<< /Encrypt 1 0 R'), 'latin1'), 'ENCRYPTED_PDF');
        });
        it.each(['startxref', 'Size', 'Root'])('refuses a missing/unreadable trailer piece: %s', async (piece) => {
            const one = await signedFixture();
            const text = one.toString('latin1');
            const changed = piece === 'startxref' ? text.replace(/startxref\s+\d+/, 'startxref\n1') :
                text.replace(new RegExp(`/${piece}\\b`), `/Bad${piece}`);
            await expectRefusal(Buffer.from(changed, 'latin1'), 'PDF_INCREMENTAL_UNSUPPORTED');
        });
        it('refuses a pdf-lib invalid object with throwOnInvalidObject enabled', async () => {
            const one = await signedFixture({ edit: (doc) => doc.context.register(doc.context.obj({ UnusedMarker: 'Marker' })) });
            const changed = Buffer.from(one.toString('latin1').replace('/UnusedMarker /Marker', '/UnusedMarker @Marker'), 'latin1');
            expect(changed.equals(one)).toBe(false);
            expect(changed.length).toBe(one.length);
            expect(readLastTrailer(changed).offset).toBe(readLastTrailer(one).offset);
            await expectRefusal(changed, 'PDF_INCREMENTAL_UNSUPPORTED');
        });
    });

    describe('finalize selects exactly one empty whole-file placeholder', () => {
        it('selects the new placeholder with an earlier signed range present', async () => {
            const one = await signedFixture();
            expect(validate((await sign(one, second)).signed).valid).toBe(true);
        });
        it('rejects two empty whole-file placeholders before checking attributes', async () => {
            const bytes = Buffer.from('/ByteRange [0 100 16486 0]\n/ByteRange [0 100 16486 0]\n'.padEnd(100, ' ') + '<' + '0'.repeat(16384) + '>', 'latin1');
            expect(bytes.length).toBe(16486);
            const attrs = cmsSigning.buildSignedAttributes(cmsSigning.readSignerCertificate(second.chainDer),
                cmsSigning.sha256(signedBytes(bytes, readByteRanges(bytes)[1])));
            expect(() => finalize(bytes, attrs.der, softwareCardSign(attrs.hash, second.privateKey), second.chainDer))
                .toThrow(expect.objectContaining({ code: 'INVALID_PREPARED_PDF' }));
        });
        it('rejects no empty whole-file placeholders', async () => {
            const one = await signedFixture();
            expect(() => finalize(one, Buffer.alloc(0), Buffer.alloc(0), second.chainDer))
                .toThrow(expect.objectContaining({ code: 'INVALID_PREPARED_PDF' }));
        });
    });

    function replaceCms(pdf: Buffer, edit: (cms: pkijs.SignedData) => void): Buffer {
        const range = readByteRanges(pdf)[0];
        const der = Buffer.from(pdf.subarray(range.contentsStart + 1, range.contentsEnd - 1).toString('latin1'), 'hex');
        const parsed = asn1js.fromBER(cmsSigning.toArrayBuffer(der));
        const cms = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: parsed.result }).content });
        edit(cms);
        const ci = new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: cms.toSchema() });
        const hex = Buffer.from(ci.toSchema().toBER()).toString('hex').toUpperCase();
        const copy = Buffer.from(pdf);
        copy.write(hex.padEnd(range.contentsEnd - range.contentsStart - 2, '0'), range.contentsStart + 1, 'latin1');
        return copy;
    }

    describe('per-signature validator', () => {
        it('validates a genuine ECDSA signature and preserves it when appending RSA', async () => {
            const one = await signedFixture();
            const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
            const cert = cmsSigning.parseCertificate(first.chainDer[0]);
            cert.subjectPublicKeyInfo = new pkijs.PublicKeyInfo({ schema: asn1js.fromBER(ab(
                keys.publicKey.export({ type: 'spki', format: 'der' }) as Buffer)).result });
            const issuerKey = await webcrypto.subtle.importKey('pkcs8',
                first.privateKey.export({ type: 'pkcs8', format: 'der' }),
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
            await cert.sign(issuerKey as any, 'SHA-256');
            const der = Buffer.from(cert.toSchema(true).toBER());
            const attrs = cmsSigning.buildSignedAttributes({ der, cert, name: 'Signer One' },
                cmsSigning.sha256(signedBytes(one, readByteRanges(one)[0])));
            const ec = replaceCms(one, (cms) => {
                cms.certificates = [cert];
                const signer = cms.signerInfos[0];
                const implicit = Buffer.from(attrs.der);
                implicit[0] = 0xa0;
                signer.signedAttrs = new pkijs.SignedAndUnsignedAttributes({ type: 0,
                    schema: asn1js.fromBER(ab(implicit)).result });
                signer.signatureAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: '1.2.840.10045.4.3.2' });
                signer.signature = new asn1js.OctetString({ valueHex: ab(cryptoSign('sha256', attrs.der,
                    { key: keys.privateKey, dsaEncoding: 'der' })) });
            });
            expect(validate(ec).reasons).toEqual([]);
            expect(validate(ec).valid).toBe(true);
            expect(validate((await sign(ec, second)).signed).signatures.map((s) => s.valid)).toEqual([true, true]);
        });

        it.each([
            ['RSA-PSS', '1.2.840.113549.1.1.10'],
            ['document timestamps', 'timestamp'],
        ])('reports an earlier unsupported %s signature without throwing or blocking signing', async (reason, oid) => {
            const one = await signedFixture();
            const unsupported = replaceCms(one, (cms) => {
                if (oid === 'timestamp') cms.encapContentInfo.eContentType = '1.2.840.113549.1.9.16.1.4';
                else cms.signerInfos[0].signatureAlgorithm.algorithmId = oid;
            });
            const two = (await sign(unsupported, second)).signed;
            const result = validate(two);
            expect(result.valid).toBe(false);
            expect(result.signatures.map((s) => s.valid)).toEqual([false, true]);
            expect(result.signatures[0].reasons.join(' ')).toContain(reason);
            expect(result.signerName).toBe('Signer Two');
        });
        it('reports an earlier range that does not end at a revision boundary', async () => {
            const one = await signedFixture();
            const range = readByteRanges(one)[0];
            const changed = Buffer.from(one.toString('latin1').replace(/\/ByteRange\s*\[[^\]]+\]/,
                (old) => `/ByteRange [0 ${range.values[1]} ${range.values[2]} ${range.values[3] - 3}`.padEnd(old.length - 1, ' ') + ']'), 'latin1');
            const two = (await sign(changed, second)).signed;
            const result = validate(two);
            expect(result.signatures.map((s) => s.valid)).toEqual([false, true]);
            expect(result.signatures[0].reasons.join(' ')).toContain('revision end');
        });
        it('signs a tampered first revision without treating its invalid signature as a precondition', async () => {
            const one = await signedFixture();
            const changed = Buffer.from(one);
            const at = changed.indexOf('Signer One');
            expect(at).toBeGreaterThan(0);
            changed[at] = 'X'.charCodeAt(0);
            const two = (await sign(changed, second)).signed;
            const result = validate(two);
            expect(result.valid).toBe(false);
            expect(result.signatures.map((s) => s.valid)).toEqual([false, true]);
            expect(result.signatures[0].reasons.join(' ')).toMatch(/file was changed/);
        });
        it('makes fake ByteRange text an invalid entry and fails closed', async () => {
            const one = await signedFixture({ edit: (doc) => {
                doc.context.register(doc.context.obj({ Note: PDFString.of('/ByteRange [0 1 2 3]') }));
            } });
            const result = validate(one);
            expect(result.signatures).toHaveLength(2);
            expect(result.signatures[0].valid).toBe(false);
            expect(result.valid).toBe(false);
        });
    });
});
