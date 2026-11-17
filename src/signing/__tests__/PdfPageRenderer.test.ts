import { PDFDocument, degrees } from 'pdf-lib';
import { nativeRequire } from '../PdfPageAnalyzer';
import { renderPdfPage } from '../PdfPageRenderer';
import { makeFixture } from './testPdfs';

let pdf: Buffer;
beforeAll(async () => {
    pdf = await makeFixture({ lines: [{ x: 50, y: 400, text: 'Podpis Wykonawcy — ąćęłńóśźż' }], twoPages: true });
});

it.each([undefined, 600, 600.5])('renders PNG with the page aspect ratio at width %s', async (maxWidthPx) => {
    const { png, widthPx, heightPx } = await renderPdfPage(pdf, 1, { maxWidthPx });
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(widthPx).toBeLessThanOrEqual(maxWidthPx ?? 1100);
    expect(heightPx / widthPx).toBeCloseTo(842 / 595, 2);
    expect(png.readUInt32BE(16)).toBe(widthPx);
    expect(png.readUInt32BE(20)).toBe(heightPx);
    const { loadImage, createCanvas } = nativeRequire()('@napi-rs/canvas');
    const image = await loadImage(png);
    const context = createCanvas(widthPx, heightPx).getContext('2d');
    context.drawImage(image, 0, 0);
    expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([255, 255, 255, 255]);
    const pixels = context.getImageData(0, 0, widthPx, heightPx).data as Uint8ClampedArray;
    expect(pixels.some((v, i) => i % 4 !== 3 && v < 100)).toBe(true);
});

it('renders the selected blank page', async () => {
    const { png } = await renderPdfPage(pdf, 2, { maxWidthPx: 100 });
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});

it('renders rotated pages with their displayed proportions', async () => {
    const doc = await PDFDocument.load(pdf);
    doc.getPage(0).setRotation(degrees(90));
    const result = await renderPdfPage(Buffer.from(await doc.save()), 1, { maxWidthPx: 600 });
    expect(result.heightPx / result.widthPx).toBeCloseTo(595 / 842, 2);
});

it.each([0, -1, 3, 1.5, NaN, Infinity])('rejects page number %s', async (page) => {
    await expect(renderPdfPage(pdf, page)).rejects.toMatchObject({ code: 'INVALID_PLACEMENT' });
});

it.each([0, -1, NaN, Infinity])('rejects invalid maximum width %s', async (maxWidthPx) => {
    await expect(renderPdfPage(pdf, 1, { maxWidthPx })).rejects.toMatchObject({ code: 'INVALID_PLACEMENT' });
});

it('maps malformed PDFs to INVALID_PDF', async () => {
    await expect(renderPdfPage(Buffer.from('bad PDF'), 1)).rejects.toMatchObject({ code: 'INVALID_PDF' });
});
