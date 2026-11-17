import {
    EncryptedPDFError,
    PDFArray,
    PDFCrossRefSection,
    PDFCrossRefStream,
    PDFDict,
    PDFDocument,
    PDFHexString,
    PDFName,
    PDFNumber,
    PDFObject,
    PDFRef,
    PDFString,
} from 'pdf-lib';
import {
    assembleCms,
    buildSignedAttributes,
    readSignerCertificate,
    sha256,
    verifyRsaSha256,
} from './CmsSigning';
import { extractPageContent, loadPdfjs } from './PdfPageAnalyzer';
import { isPlaceablePage } from './ContractorSignaturePlace';
import {
    BYTERANGE_PLACEHOLDER_VALUE,
    patchByteRange,
    LastTrailer,
    readLastTrailer,
    readByteRanges,
    signedBytes,
} from './PdfSignatureLayout';
import { validate } from './PdfSignatureValidator';
import { createAppearanceStream, formatSigningDate } from './SignatureAppearance';
import {
    collides,
    findCornerRect,
    findFreeArea,
    findLetterClosing,
} from './SignaturePlacement';
import { SigningError } from './SigningError';
import {
    PdfRect,
    PlacementReport,
    PrepareOptions,
    PrepareResult,
    SignaturePlacement,
    ValidationResult,
} from './SigningTypes';

const DEFAULT_TIME_ZONE = 'Europe/Warsaw';
/** Bytes reserved on top of the certificate chain: CMS framing, attributes, RSA-4096 signature. */
const CMS_OVERHEAD_BYTES = 2048;
const SIGNATURE_FIELD_NAME = 'ENVI_Podpis_1';

function pdfDate(date: Date): string {
    const p = (n: number, width = 2) => String(n).padStart(width, '0');
    return (
        `D:${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
        `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
    );
}

interface ResolvedPlacement extends PlacementReport {
    source: PlacementReport['source'];
}

async function resolvePlacement(
    pdfDoc: PDFDocument,
    pdfBytes: Buffer,
    placement: SignaturePlacement,
): Promise<ResolvedPlacement> {
    if (placement === 'none') return { source: 'none' };
    const pageCount = pdfDoc.getPageCount();

    if (typeof placement === 'object') {
        const { page, rect } = placement;
        const valid =
            Number.isInteger(page) &&
            page >= 1 &&
            page <= pageCount &&
            rect &&
            [rect.x, rect.y, rect.width, rect.height].every(isFinite) &&
            rect.width > 0 &&
            rect.height > 0;
        if (!valid) {
            throw new SigningError(
                'INVALID_PLACEMENT',
                `Explicit placement needs a page between 1 and ${pageCount} and a rectangle with positive size.`,
            );
        }
        // The rectangle comes from a click on a picture of the page, converted linearly: that is
        // valid only for a plain page, and a rectangle outside the page would be an invisible graphic.
        const target = pdfDoc.getPage(page - 1);
        if (!isPlaceablePage(target)) {
            throw new SigningError(
                'PLACEMENT_BLOCKED',
                'Rotated or offset page cannot take an explicit rectangle.',
            );
        }
        const size = target.getMediaBox();
        const slack = 0.5;
        if (
            rect.x < -slack ||
            rect.y < -slack ||
            rect.x + rect.width > size.width + slack ||
            rect.y + rect.height > size.height + slack
        ) {
            throw new SigningError(
                'INVALID_PLACEMENT',
                'Explicit placement must lie entirely on the page.',
            );
        }
        return { source: 'explicit', page, rect };
    }
    if (placement !== 'letterClosing' && placement !== 'lastPageCorner') {
        throw new SigningError('INVALID_PLACEMENT', 'Unknown placement mode.');
    }

    // Automatic placement is defined only for plain pages: a rotated page or a crop box other than
    // the media box would need coordinate conversions that nobody has verified on real letters.
    const pageNumber = pageCount;
    const page = pdfDoc.getPage(pageNumber - 1);
    const media = page.getMediaBox();
    if (!isPlaceablePage(page)) {
        throw new SigningError(
            'PLACEMENT_BLOCKED',
            'Rotated or offset page requires a manual rectangle.',
        );
    }
    const content = await extractPageContent(
        pdfBytes,
        pageNumber,
        media.width,
        media.height,
    );

    let fallbackReason: string | undefined;
    let anchor: { bottom: number; left: number } | undefined;
    let closingFailure: string | undefined;
    if (placement === 'letterClosing') {
        const closing = findLetterClosing(content, media.width, media.height);
        if (closing.found) {
            if (!('failure' in closing)) {
                return { source: 'letter_closing', page: pageNumber, rect: closing.rect };
            }
            closingFailure = closing.failure;
            anchor = closing.anchor;
        } else {
            fallbackReason =
                'No standalone letter closing on the last page; using the bottom right corner.';
        }
    }
    if (closingFailure) {
        // A closing exists but its place is taken: nearest free area, never over content.
        const rect = findFreeArea(content, media.width, media.height, anchor);
        if (!rect) {
            throw new SigningError(
                'PLACEMENT_BLOCKED',
                closingFailure + ' No free area for the signature on the last page.',
            );
        }
        return {
            source: 'fallback_free_area',
            page: pageNumber,
            rect,
            fallbackReason: closingFailure,
        };
    }
    const rect = findCornerRect(content, media.width, media.height);
    if (!rect) {
        throw new SigningError(
            'PLACEMENT_BLOCKED',
            'No free area for the signature on the last page; specify a manual rectangle.',
        );
    }
    return { source: 'last_page_corner', page: pageNumber, rect, fallbackReason };
}

function addSignatureField(
    pdfDoc: PDFDocument,
    pageIndex: number,
    rect: PdfRect,
    signatureRef: PDFRef,
    appearanceRef: PDFRef | undefined,
): void {
    const context = pdfDoc.context;
    const pageRef = pdfDoc.getPage(pageIndex).ref;
    const widget = context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        T: PDFString.of(SIGNATURE_FIELD_NAME),
        V: signatureRef,
        // Print + Locked
        F: 132,
        P: pageRef,
        Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    });
    if (appearanceRef) {
        widget.set(PDFName.of('AP'), context.obj({ N: appearanceRef }));
    }
    const widgetRef = context.register(widget);
    pdfDoc.getPage(pageIndex).node.addAnnot(widgetRef);

    const catalog = pdfDoc.catalog;
    let acroForm = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    if (!acroForm) {
        acroForm = context.obj({});
        catalog.set(PDFName.of('AcroForm'), context.register(acroForm));
    }
    let fields = acroForm.lookupMaybe(PDFName.of('Fields'), PDFArray);
    if (!fields) {
        fields = context.obj([]);
        acroForm.set(PDFName.of('Fields'), fields);
    }
    fields.push(widgetRef);
    // SignaturesExist | AppendOnly
    acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(3));
}

function incrementalUnsupported(error: any): SigningError {
    return error instanceof SigningError ? error : new SigningError(
        'PDF_INCREMENTAL_UNSUPPORTED', 'Cannot append to this PDF: ' + error.message,
    );
}

/** Object streams can hide signature hints from the raw-byte scan. */
function hasSignatureHint(doc: PDFDocument): boolean {
    const name = PDFName.of;
    const form = doc.catalog.lookupMaybe(name('AcroForm'), PDFDict);
    if ((form?.lookupMaybe(name('SigFlags'), PDFNumber)?.asNumber() || 0) & 1) return true;
    const seen = new Set<PDFObject>();
    const inspect = (object: PDFObject): boolean => {
        if (seen.has(object)) return false;
        seen.add(object);
        if (object instanceof PDFDict) {
            const value = object.lookup(name('V'));
            if (value instanceof PDFDict &&
                (value.lookup(name('Type')) === name('Sig') || value.has(name('ByteRange')))) return true;
            return object.values().some(inspect);
        }
        return object instanceof PDFArray && object.asArray().some(inspect);
    };
    return doc.context.enumerateIndirectObjects().some(([, object]) => inspect(object));
}

/** Inspect permissions and names without getForm(), which can remove XFA. */
function inspectSignedForm(doc: PDFDocument): string {
    const name = PDFName.of;
    const locked = () => { throw new SigningError('PDF_LOCKED', 'The PDF locks changes through DocMDP, FieldMDP or a signed field Lock.'); };
    const perms = doc.catalog.lookupMaybe(name('Perms'), PDFDict);
    if (perms?.has(name('DocMDP'))) locked();
    // Direct dictionaries (including transform dictionaries) can be nested in indirect ones.
    const seen = new Set<PDFObject>();
    const inspect = (object: PDFObject | undefined): void => {
        if (!object || seen.has(object)) return;
        seen.add(object);
        if (object instanceof PDFDict) {
            const method = object.lookup(name('TransformMethod'));
            if (method === name('DocMDP') || method === name('FieldMDP')) locked();
            if (object.has(name('Lock')) && object.lookup(name('V')) instanceof PDFDict) locked();
            object.values().forEach(inspect);
        } else if (object instanceof PDFArray) object.asArray().forEach(inspect);
    };
    doc.context.enumerateIndirectObjects().forEach(([, object]) => inspect(object));
    const form = doc.catalog.lookupMaybe(name('AcroForm'), PDFDict);
    if (form?.has(name('XFA'))) throw new Error('XFA forms are unsupported.');
    const names = new Set<string>();
    const visited = new Set<PDFDict>();
    const fields = (array: PDFArray, parent = '', inheritedSigned = false): boolean => {
        let signed = false;
        for (let i = 0; i < array.size(); i++) {
            const field = array.lookup(i, PDFDict);
            if (visited.has(field)) throw new Error('Cyclic or shared form field.');
            visited.add(field);
            const title = field.lookupMaybe(name('T'), PDFString, PDFHexString)?.decodeText();
            const full = title ? (parent ? parent + '.' : '') + title : parent;
            if (title) names.add(title);
            if (full) names.add(full);
            const kids = field.lookupMaybe(name('Kids'), PDFArray);
            const hasSignature = field.has(name('V')) ? field.lookup(name('V')) instanceof PDFDict : inheritedSigned;
            const signedKids = kids ? fields(kids, full, hasSignature) : false;
            if (field.has(name('Lock')) && (hasSignature || signedKids)) locked();
            signed = signed || hasSignature || signedKids;
        }
        return signed;
    };
    const roots = form?.lookupMaybe(name('Fields'), PDFArray);
    if (roots) fields(roots);
    let number = 1;
    while (names.has(`ENVI_Podpis_${number}`)) number++;
    return `ENVI_Podpis_${number}`;
}

function checkWidgetOverlap(doc: PDFDocument, placement: ResolvedPlacement): void {
    if (!placement.rect || !placement.page) return;
    const annots = doc.getPage(placement.page - 1).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) return;
    const obstacles = [];
    for (let i = 0; i < annots.size(); i++) {
        const annot = annots.lookup(i, PDFDict);
        if (annot.lookup(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;
        const rect = annot.lookup(PDFName.of('Rect'), PDFArray);
        if (rect.size() !== 4) throw new Error('Invalid widget rectangle.');
        const [x0, y0, x1, y1] = rect.asArray().map((n) => doc.context.lookup(n, PDFNumber).asNumber());
        if (![x0, y0, x1, y1].every(Number.isFinite)) throw new Error('Invalid widget rectangle.');
        if (x0 === x1 || y0 === y1) continue;
        obstacles.push({ left: Math.min(x0, x1), right: Math.max(x0, x1), bottom: Math.min(y0, y1), top: Math.max(y0, y1) });
    }
    if (collides(placement.rect, obstacles)) {
        throw new SigningError('SIGNATURE_WIDGET_OVERLAP', 'The signature graphic overlaps an existing form widget.');
    }
}

function addIncrementalField(
    doc: PDFDocument, pageIndex: number, rect: PdfRect, signatureRef: PDFRef,
    appearanceRef: PDFRef | undefined, fieldName: string, touched: Set<PDFRef>,
): PDFRef {
    const context = doc.context;
    const name = PDFName.of;
    const page = doc.getPage(pageIndex);
    const widget = context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig',
        T: PDFString.of(fieldName), V: signatureRef, F: 132, P: page.ref,
        Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height] });
    if (appearanceRef) widget.set(name('AP'), context.obj({ N: appearanceRef }));
    const widgetRef = context.register(widget);
    const append = (owner: PDFDict, ownerRef: PDFRef, key: string) => {
        const raw = owner.get(name(key));
        let array = owner.lookupMaybe(name(key), PDFArray);
        if (!array) { array = context.obj([]); owner.set(name(key), array); }
        array.push(widgetRef);
        touched.add(raw instanceof PDFRef ? raw : ownerRef);
    };
    append(page.node, page.ref, 'Annots');
    const catalogRef = context.trailerInfo.Root;
    if (!(catalogRef instanceof PDFRef)) throw new Error('Missing catalog reference.');
    let formRef = doc.catalog.get(name('AcroForm'));
    let form = doc.catalog.lookupMaybe(name('AcroForm'), PDFDict);
    if (!form) {
        form = context.obj({});
        formRef = context.register(form);
        doc.catalog.set(name('AcroForm'), formRef);
        touched.add(catalogRef);
    }
    const ownerRef = formRef instanceof PDFRef ? formRef : catalogRef;
    append(form, ownerRef, 'Fields');
    const flags = form.lookupMaybe(name('SigFlags'), PDFNumber)?.asNumber() || 0;
    if (!Number.isInteger(flags) || flags < 0 || flags > 2147483647) throw new Error('Invalid SigFlags.');
    if ((flags | 3) !== flags) {
        form.set(name('SigFlags'), PDFNumber.of(flags | 3));
        touched.add(ownerRef);
    }
    return widgetRef;
}

function serialize(object: { sizeInBytes(): number; copyBytesInto(buffer: Uint8Array, offset: number): number }): Buffer {
    const bytes = Buffer.alloc(object.sizeInBytes());
    if (object.copyBytesInto(bytes, 0) !== bytes.length) throw new Error('PDF serializer size mismatch.');
    return bytes;
}

async function appendRevision(
    doc: PDFDocument, original: Buffer, trailer: LastTrailer, boundary: number,
    touched: Set<PDFRef>, signatureRef: PDFRef,
): Promise<{ pdf: Buffer; signatureStart: number; signatureEnd: number }> {
    await doc.flush();
    const context = doc.context;
    const objects = context.enumerateIndirectObjects().filter(([ref]) =>
        ref.objectNumber > boundary || touched.has(ref));
    const chunks = [original, Buffer.from('\n')];
    let offset = original.length + 1;
    let signatureStart = 0, signatureEnd = 0;
    const entries: Array<{ ref: PDFRef; offset: number }> = [];
    for (const [ref, object] of objects) {
        entries.push({ ref, offset });
        const bytes = Buffer.concat([Buffer.from(`${ref.objectNumber} ${ref.generationNumber} obj\n`), serialize(object), Buffer.from('\nendobj\n')]);
        if (ref === signatureRef) { signatureStart = offset; signatureEnd = offset + bytes.length; }
        chunks.push(bytes);
        offset += bytes.length;
    }
    const dict = trailer.dict.clone(context);
    for (const key of ['Type', 'Length', 'Filter', 'DecodeParms', 'W', 'Index', 'XRefStm']) dict.delete(PDFName.of(key));
    dict.set(PDFName.of('Prev'), PDFNumber.of(trailer.offset));
    const idRaw = dict.get(PDFName.of('ID'));
    if (idRaw) {
        const id = context.lookup(idRaw, PDFArray);
        if (id.size() !== 2 || !(context.lookup(id.get(0)) instanceof PDFHexString || context.lookup(id.get(0)) instanceof PDFString)) {
            throw new Error('Invalid trailer ID.');
        }
        dict.set(PDFName.of('ID'), context.obj([id.get(0), PDFHexString.of(sha256(Buffer.concat(chunks)).toString('hex'))]));
    }
    const xrefOffset = offset;
    if (trailer.stream) {
        const ref = context.nextRef();
        dict.set(PDFName.of('Size'), PDFNumber.of(context.largestObjectNumber + 1));
        const stream = PDFCrossRefStream.of(dict, [], false);
        entries.forEach((entry) => stream.addUncompressedEntry(entry.ref, entry.offset));
        stream.addUncompressedEntry(ref, xrefOffset);
        chunks.push(Buffer.from(`${ref.objectNumber} ${ref.generationNumber} obj\n`), serialize(stream), Buffer.from('\nendobj\n'));
    } else {
        dict.set(PDFName.of('Size'), PDFNumber.of(context.largestObjectNumber + 1));
        const xref = PDFCrossRefSection.createEmpty();
        entries.forEach((entry) => xref.addEntry(entry.ref, entry.offset));
        chunks.push(serialize(xref), Buffer.from('trailer\n'), serialize(dict), Buffer.from('\n'));
    }
    chunks.push(Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`));
    if (!signatureStart) throw new Error('Missing new signature object.');
    return { pdf: Buffer.concat(chunks), signatureStart, signatureEnd };
}

async function checkIncrement(pdf: Buffer, pages: number, fieldName: string, widgetRef: PDFRef): Promise<void> {
    const loading = loadPdfjs().getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, verbosity: 0 });
    let doc: any;
    try {
        doc = await loading.promise;
        const fields = await doc.getFieldObjects();
        if (doc.numPages !== pages || !fields?.[fieldName]?.some((field: any) =>
            field.type === 'signature' && field.id === `${widgetRef.objectNumber}R`)) {
            throw new Error('Appended signature is unreachable or page count changed.');
        }
    } finally {
        if (doc) await doc.destroy(); else await loading.destroy();
    }
}

/**
 * Stateless step 1 of 2: turns a PDF into a PDF with a reserved signature, plus the hash that
 * the smart card must sign.
 *
 * The same inputs and the same `options.now` always produce byte-identical output. Nothing is
 * stored: the caller keeps `preparedPdf` and `signedAttrsDer` until the signature comes back.
 *
 * It does not judge the certificate (validity, qualified issuer); the HTTP layer does.
 */
export async function prepare(
    pdfBytes: Buffer,
    chainDer: Buffer[],
    placement: SignaturePlacement,
    options: PrepareOptions = {},
): Promise<PrepareResult> {
    const signer = readSignerCertificate(chainDer);
    const now = options.now || new Date();
    const timeZone = options.timeZone || DEFAULT_TIME_ZONE;

    let incremental = pdfBytes.includes('/ByteRange');
    let trailer = incremental ? readLastTrailer(pdfBytes) : undefined;

    let pdfDoc: PDFDocument;
    try {
        pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false, ...(incremental ? { throwOnInvalidObject: true } : {}) });
    } catch (e: any) {
        if (e instanceof EncryptedPDFError) {
            throw new SigningError('ENCRYPTED_PDF', 'The PDF is encrypted.');
        }
        throw new SigningError(
            incremental ? 'PDF_INCREMENTAL_UNSUPPORTED' : 'INVALID_PDF',
            'The PDF could not be read: ' + (e && e.message),
        );
    }
    try { incremental = incremental || hasSignatureHint(pdfDoc); }
    catch (e) { throw incrementalUnsupported(e); }
    if (incremental && !trailer) {
        trailer = readLastTrailer(pdfBytes);
        try { pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false, throwOnInvalidObject: true }); }
        catch (e) { throw incrementalUnsupported(e); }
    }
    const pages = pdfDoc.getPageCount();
    if (pages === 0) throw new SigningError('INVALID_PDF', 'The PDF has no pages.');

    const resolved = await resolvePlacement(pdfDoc, pdfBytes, placement);
    const { rect, page } = resolved;
    const report: PlacementReport = { ...resolved };

    const context = pdfDoc.context;
    let fieldName = SIGNATURE_FIELD_NAME;
    let boundary = 0;
    const touched = new Set<PDFRef>();
    if (trailer) {
        try {
            fieldName = inspectSignedForm(pdfDoc);
            const root = trailer.dict.get(PDFName.of('Root'));
            if (context.lookup(root, PDFDict) !== pdfDoc.catalog) throw new Error('Invalid trailer Root.');
            const info = trailer.dict.get(PDFName.of('Info'));
            if (info) context.lookup(info, PDFDict);
            boundary = Math.max(context.largestObjectNumber, trailer.size - 1);
            context.largestObjectNumber = boundary;
            checkWidgetOverlap(pdfDoc, resolved);
        } catch (e) { throw incrementalUnsupported(e); }
    }
    let appearanceRef: PDFRef | undefined;
    if (rect && page) {
        appearanceRef = await createAppearanceStream(
            pdfDoc,
            rect,
            signer.name,
            formatSigningDate(now, timeZone),
        );
    }

    const capacityBytes =
        Math.ceil(
            (chainDer.reduce((sum, c) => sum + c.length, 0) + CMS_OVERHEAD_BYTES) / 512,
        ) * 512;
    const hexLength = capacityBytes * 2;
    const signature = context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: 'ETSI.CAdES.detached',
        ByteRange: [
            0,
            BYTERANGE_PLACEHOLDER_VALUE,
            BYTERANGE_PLACEHOLDER_VALUE,
            BYTERANGE_PLACEHOLDER_VALUE,
        ],
        Contents: PDFHexString.of('0'.repeat(hexLength)),
        M: PDFString.of(pdfDate(now)),
        Name: PDFHexString.fromText(signer.name),
    });
    const signatureRef = context.register(signature);
    let patched: ReturnType<typeof patchByteRange>;
    if (trailer) {
        try {
            const widgetRef = addIncrementalField(
                pdfDoc, page ? page - 1 : pages - 1,
                rect && page ? rect : { x: 0, y: 0, width: 0, height: 0 },
                signatureRef, appearanceRef, fieldName, touched,
            );
            const saved = await appendRevision(pdfDoc, pdfBytes, trailer, boundary, touched, signatureRef);
            patched = patchByteRange(saved.pdf, hexLength, saved.signatureStart, saved.signatureEnd);
            if (!patched.pdf.subarray(0, pdfBytes.length).equals(pdfBytes)) {
                throw new SigningError('PDF_INCREMENTAL_UNSUPPORTED', 'Incremental signing changed the original PDF prefix.');
            }
            await checkIncrement(patched.pdf, pages, fieldName, widgetRef);
        } catch (e) { throw incrementalUnsupported(e); }
    } else {
        addSignatureField(
            pdfDoc,
            page ? page - 1 : pages - 1,
            rect && page ? rect : { x: 0, y: 0, width: 0, height: 0 },
            signatureRef,
            appearanceRef,
        );
        pdfDoc.setModificationDate(now);
        pdfDoc.setProducer('PS ENVI');
        const saved = Buffer.from(
            await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false }),
        );
        patched = patchByteRange(saved, hexLength);
    }
    const { pdf: preparedPdf, range } = patched;

    const digest = sha256(signedBytes(preparedPdf, range));
    const attributes = buildSignedAttributes(signer, digest);
    const checkHex = attributes.hash.toString('hex').slice(0, 8).toUpperCase();
    return {
        preparedPdf,
        signedAttrsDer: attributes.der,
        hashToSign: attributes.hash,
        checkCode: `${checkHex.slice(0, 4)}-${checkHex.slice(4)}`,
        pages,
        placement: report,
        signerName: signer.name,
    };
}

/**
 * Stateless step 2 of 2: builds the CMS from the card's signature over `hashToSign`, embeds it
 * in the reserved placeholder and returns the signed PDF.
 *
 * Throws instead of producing a file that would not validate: the prepared PDF must be the one
 * the signed attributes were computed for, and the signature must verify with the certificate.
 */
export function finalize(
    preparedPdf: Buffer,
    signedAttrsDer: Buffer,
    signature: Buffer,
    chainDer: Buffer[],
): Buffer {
    const signer = readSignerCertificate(chainDer);
    const ranges = readByteRanges(preparedPdf).filter((range) => {
        const [start, length, end, tail] = range.values;
        return range.values.every(Number.isSafeInteger) && start === 0 && length < end && end + tail === preparedPdf.length &&
            end <= preparedPdf.length && /^<0+>$/.test(preparedPdf.subarray(length, end).toString('latin1'));
    });
    if (ranges.length !== 1) {
        throw new SigningError(
            'INVALID_PREPARED_PDF',
            'A prepared PDF must contain exactly one signature placeholder.',
        );
    }
    const range = ranges[0];
    const { contentsStart, contentsEnd } = range;
    const capacityHex = contentsEnd - contentsStart - 2;
    const placeholder = preparedPdf.subarray(contentsStart, contentsEnd).toString('latin1');
    if (
        range.values[0] !== 0 ||
        range.values[2] + range.values[3] !== preparedPdf.length ||
        placeholder !== '<' + '0'.repeat(capacityHex) + '>'
    ) {
        throw new SigningError(
            'INVALID_PREPARED_PDF',
            'The signature placeholder is not empty or the ByteRange does not cover the file.',
        );
    }

    // The attributes must be the ones belonging to exactly this file and this certificate.
    const expected = buildSignedAttributes(
        signer,
        sha256(signedBytes(preparedPdf, range)),
    );
    if (!expected.der.equals(signedAttrsDer)) {
        throw new SigningError(
            'INVALID_PREPARED_PDF',
            'The signed attributes do not belong to this PDF and certificate.',
        );
    }
    if (!verifyRsaSha256(signer.der, signedAttrsDer, signature)) {
        throw new SigningError(
            'SIGNATURE_MISMATCH',
            'The signature is not a valid signature of the prepared hash by this certificate.',
        );
    }

    const cmsHex = assembleCms(chainDer, signedAttrsDer, signature)
        .toString('hex')
        .toUpperCase();
    if (cmsHex.length > capacityHex) {
        throw new SigningError(
            'PLACEHOLDER_TOO_SMALL',
            'The signature does not fit in the reserved space.',
        );
    }
    const signed = Buffer.from(preparedPdf);
    signed.write(cmsHex.padEnd(capacityHex, '0'), contentsStart + 1, 'latin1');
    return signed;
}

export { validate };
export type { ValidationResult };
