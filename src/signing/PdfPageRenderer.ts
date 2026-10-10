import path from 'path';
import { loadPdfjs, nativeRequire } from './PdfPageAnalyzer';
import { SigningError } from './SigningError';

/**
 * Hard limits of the picture, whatever the page size says: a 576-byte PDF may declare a page
 * 10 x 14400 pt, and scaling only the width would ask for a canvas of several gigabytes.
 */
const MAX_HEIGHT_PX = 2400;
const MAX_PIXELS = 4_000_000;
/** pdfjs refuses to decode embedded images above this many pixels (they are drawn as blanks). */
const MAX_EMBEDDED_IMAGE_PIXELS = 16_000_000;

export async function renderPdfPage(
    pdfBytes: Buffer,
    pageNumber: number,
    options: { maxWidthPx?: number } = {},
): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
    const maxWidthPx = options.maxWidthPx ?? 1100;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isFinite(maxWidthPx) || maxWidthPx < 1) {
        throw new SigningError('INVALID_PLACEMENT', 'Page number and maximum width must be positive.');
    }
    const pdfjs = loadPdfjs();
    const requireNative = nativeRequire();
    const { createCanvas } = requireNative('@napi-rs/canvas');
    const pdfjsDir = path.dirname(requireNative.resolve('pdfjs-dist/package.json'));
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBytes),
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        useWorkerFetch: false,
        standardFontDataUrl: path.join(pdfjsDir, 'standard_fonts').split(path.sep).join('/') + '/',
        cMapUrl: path.join(pdfjsDir, 'cmaps').split(path.sep).join('/') + '/',
        cMapPacked: true,
        maxImageSize: MAX_EMBEDDED_IMAGE_PIXELS,
        verbosity: 0,
    });
    let doc: any;
    try {
        doc = await loadingTask.promise;
        if (pageNumber > doc.numPages) {
            throw new SigningError('INVALID_PLACEMENT', `Page number must be between 1 and ${doc.numPages}.`);
        }
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
            Math.floor(maxWidthPx) / base.width,
            MAX_HEIGHT_PX / base.height,
            Math.sqrt(MAX_PIXELS / (base.width * base.height)),
        );
        const viewport = page.getViewport({ scale });
        const widthPx = Math.max(1, Math.min(Math.floor(maxWidthPx), Math.round(viewport.width)));
        const heightPx = Math.max(1, Math.min(MAX_HEIGHT_PX, Math.ceil(viewport.height)));
        const canvas = createCanvas(widthPx, heightPx);
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
        return { png: canvas.toBuffer('image/png'), widthPx, heightPx };
    } catch (e: any) {
        if (e instanceof SigningError) throw e;
        if (e && e.name === 'PasswordException') throw new SigningError('ENCRYPTED_PDF', 'The PDF is encrypted.');
        throw new SigningError('INVALID_PDF', 'The PDF page could not be rendered: ' + (e && e.message));
    } finally {
        if (doc) await doc.destroy();
        else await loadingTask.destroy();
    }
}
