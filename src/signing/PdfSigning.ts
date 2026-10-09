import {
    EncryptedPDFError,
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFHexString,
    PDFName,
    PDFNumber,
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
import { extractPageContent } from './PdfPageAnalyzer';
import {
    BYTERANGE_PLACEHOLDER_VALUE,
    patchByteRange,
    readByteRanges,
    signedBytes,
} from './PdfSignatureLayout';
import { validate } from './PdfSignatureValidator';
import { createAppearanceStream, formatSigningDate } from './SignatureAppearance';
import {
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
    const crop = page.getCropBox();
    if (
        page.getRotation().angle % 360 !== 0 ||
        media.x !== 0 ||
        media.y !== 0 ||
        crop.x !== media.x ||
        crop.y !== media.y ||
        crop.width !== media.width ||
        crop.height !== media.height
    ) {
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

    if (readByteRanges(pdfBytes).length > 0) {
        // pdf-lib rewrites the whole file, which would break an existing signature.
        throw new SigningError(
            'ALREADY_SIGNED',
            'The PDF already carries a signature; adding another is not supported.',
        );
    }

    let pdfDoc: PDFDocument;
    try {
        pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
    } catch (e: any) {
        if (e instanceof EncryptedPDFError) {
            throw new SigningError('ENCRYPTED_PDF', 'The PDF is encrypted.');
        }
        throw new SigningError(
            'INVALID_PDF',
            'The PDF could not be read: ' + (e && e.message),
        );
    }
    const pages = pdfDoc.getPageCount();
    if (pages === 0) throw new SigningError('INVALID_PDF', 'The PDF has no pages.');

    const resolved = await resolvePlacement(pdfDoc, pdfBytes, placement);
    const { rect, page } = resolved;
    const report: PlacementReport = { ...resolved };

    const context = pdfDoc.context;
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
    const { pdf: preparedPdf, range } = patchByteRange(saved, hexLength);

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
    const ranges = readByteRanges(preparedPdf);
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
