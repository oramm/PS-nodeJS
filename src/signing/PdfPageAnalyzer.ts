import path from 'path';
import { SigningError } from './SigningError';

/** Axis-aligned box in PDF user space (points, origin bottom-left). */
export interface Box {
    left: number;
    bottom: number;
    right: number;
    top: number;
}

export interface TextChunk {
    text: string;
    /** Y of the text baseline. */
    baselineY: number;
    box: Box;
}

export interface PageContent {
    chunks: TextChunk[];
    /** Everything visible on the page: text boxes, images, painted paths. */
    obstacles: Box[];
}

/**
 * pdfjs-dist 5 is ESM-only while this backend is CommonJS (and Jest runs it in a VM that cannot
 * import ESM). Node >= 22.12 can `require()` an ES module natively; `createRequire` taken from
 * `process.getBuiltinModule` is the real Node one even inside Jest, which replaces
 * `require('module').createRequire` with its own. The version is pinned in package.json, because
 * the operator-list format parsed below is a pdfjs internal.
 */
let pdfjsModule: any;
function nativeRequire(): any {
    const nodeModule = (process as any).getBuiltinModule('module');
    return nodeModule.createRequire(path.join(process.cwd(), 'package.json'));
}
function loadPdfjs(): any {
    if (!pdfjsModule) {
        pdfjsModule = nativeRequire()('pdfjs-dist/legacy/build/pdf.mjs');
    }
    return pdfjsModule;
}

type Matrix = [number, number, number, number, number, number];

/** Result of applying `inner` first, then `outer` (PDF `cm` semantics: new = inner x outer). */
function multiply(inner: Matrix, outer: Matrix): Matrix {
    return [
        inner[0] * outer[0] + inner[1] * outer[2],
        inner[0] * outer[1] + inner[1] * outer[3],
        inner[2] * outer[0] + inner[3] * outer[2],
        inner[2] * outer[1] + inner[3] * outer[3],
        inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
        inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
    ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function transformedRect(
    m: Matrix,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): Box {
    const corners = [
        apply(m, x0, y0),
        apply(m, x1, y0),
        apply(m, x0, y1),
        apply(m, x1, y1),
    ];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        bottom: Math.min(...ys),
        top: Math.max(...ys),
    };
}

interface GraphicsState {
    ctm: Matrix;
    fill: string | null;
    lineWidth: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * Reads one page of a PDF and returns its text (with positions) and all visible content as
 * obstacles. This is the Node counterpart of LetterClosingFinder.cs from the drive-szafir-sign
 * skill (an iText event listener): text chunks, images and painted paths, where pure white fills
 * and clip-only paths are not obstacles.
 *
 * Fails closed: an operator list it cannot interpret throws instead of reporting an empty page,
 * because an empty page would let a signature land on top of content.
 */
export async function extractPageContent(
    pdfBytes: Buffer,
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
): Promise<PageContent> {
    const pdfjs = loadPdfjs();
    const OPS = pdfjs.OPS;
    // pdfjs insists on a trailing forward slash, also on Windows.
    const fontsDir =
        path
            .join(
                path.dirname(nativeRequire().resolve('pdfjs-dist/package.json')),
                'standard_fonts',
            )
            .split(path.sep)
            .join('/') + '/';

    const loadingTask = pdfjs.getDocument({
        // pdfjs takes ownership of the buffer, so it gets a copy.
        data: new Uint8Array(pdfBytes),
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        useWorkerFetch: false,
        standardFontDataUrl: fontsDir,
        maxImageSize: 4096 * 4096,
        verbosity: 0,
    });

    let doc: any;
    try {
        doc = await loadingTask.promise;
        const page = await doc.getPage(pageNumber);
        const content: PageContent = { chunks: [], obstacles: [] };

        const textContent = await page.getTextContent();
        for (const item of textContent.items) {
            if (typeof item.str !== 'string' || item.str.trim() === '') continue;
            const t = item.transform as number[];
            const size = Math.hypot(t[2], t[3]) || 1;
            const style = textContent.styles[item.fontName] || {};
            const ascent = typeof style.ascent === 'number' ? style.ascent : 0.9;
            const descent =
                typeof style.descent === 'number' ? style.descent : -0.2;
            // Unit text space: x along the baseline (item.width long), y along the glyph "up" vector.
            const unit: Matrix = [
                t[0] / size,
                t[1] / size,
                t[2] / size,
                t[3] / size,
                t[4],
                t[5],
            ];
            const box = transformedRect(
                unit,
                0,
                descent * size,
                item.width,
                ascent * size,
            );
            content.chunks.push({ text: item.str, baselineY: t[5], box });
            content.obstacles.push(box);
        }

        const wholePage: Box = {
            left: 0,
            bottom: 0,
            right: pageWidth,
            top: pageHeight,
        };
        const operatorList = await page.getOperatorList();
        const stack: GraphicsState[] = [];
        let state: GraphicsState = {
            ctm: IDENTITY,
            fill: '#000000',
            lineWidth: 1,
        };
        const paintOps = new Set<number>([
            OPS.stroke,
            OPS.closeStroke,
            OPS.fill,
            OPS.eoFill,
            OPS.fillStroke,
            OPS.eoFillStroke,
            OPS.closeFillStroke,
            OPS.closeEOFillStroke,
        ]);
        const fillOnlyOps = new Set<number>([OPS.fill, OPS.eoFill]);
        const unitSquareOps = new Set<number>([
            OPS.paintImageXObject,
            OPS.paintInlineImageXObject,
            OPS.paintImageMaskXObject,
            OPS.paintSolidColorImageMask,
        ]);
        const wholePageOps = new Set<number>([
            OPS.shadingFill,
            OPS.paintInlineImageXObjectGroup,
            OPS.paintImageMaskXObjectGroup,
        ]);
        const repeatOps = new Set<number>([
            OPS.paintImageXObjectRepeat,
            OPS.paintImageMaskXObjectRepeat,
        ]);
        const colourOps = new Set<number>([
            OPS.setFillRGBColor,
            OPS.setFillGray,
            OPS.setFillCMYKColor,
            OPS.setFillColor,
            OPS.setFillColorN,
        ]);

        const addPath = (paintOp: number, rawMinMax: any) => {
            if (!paintOps.has(paintOp)) return; // endPath / clip-only: invisible
            // White page or cell backgrounds are empty space, not obstacles.
            if (fillOnlyOps.has(paintOp) && state.fill === '#ffffff') return;
            // pdfjs hands over either a plain array or a Float32Array.
            const minMax: number[] =
                Array.isArray(rawMinMax) || ArrayBuffer.isView(rawMinMax)
                    ? Array.from(rawMinMax as ArrayLike<number>)
                    : [];
            if (minMax.length < 4 || !minMax.every((v) => isFinite(v))) {
                content.obstacles.push(wholePage);
                return;
            }
            const pad = Math.max(1, state.lineWidth / 2);
            const box = transformedRect(
                state.ctm,
                minMax[0],
                minMax[1],
                minMax[2],
                minMax[3],
            );
            content.obstacles.push({
                left: box.left - pad,
                bottom: box.bottom - pad,
                right: box.right + pad,
                top: box.top + pad,
            });
        };

        for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op: number = operatorList.fnArray[i];
            const args: any = operatorList.argsArray[i];
            if (op === OPS.save) {
                stack.push({ ...state });
            } else if (op === OPS.restore) {
                if (stack.length > 0) state = stack.pop() as GraphicsState;
            } else if (op === OPS.transform) {
                state.ctm = multiply(args as Matrix, state.ctm);
            } else if (op === OPS.paintFormXObjectBegin) {
                stack.push({ ...state });
                if (Array.isArray(args) && Array.isArray(args[0])) {
                    state.ctm = multiply(args[0] as Matrix, state.ctm);
                }
            } else if (op === OPS.paintFormXObjectEnd) {
                if (stack.length > 0) state = stack.pop() as GraphicsState;
            } else if (op === OPS.setLineWidth) {
                state.lineWidth = Number(args[0]) || 0;
            } else if (colourOps.has(op)) {
                // Pattern or unknown colour: never treated as white.
                state.fill =
                    Array.isArray(args) && typeof args[0] === 'string'
                        ? String(args[0]).toLowerCase()
                        : null;
            } else if (op === OPS.constructPath) {
                if (!Array.isArray(args) || typeof args[0] !== 'number') {
                    throw new Error(
                        'Unsupported pdfjs operator list format (constructPath)',
                    );
                }
                addPath(args[0], args[2]);
            } else if (op === OPS.rawFillPath) {
                content.obstacles.push(wholePage);
            } else if (unitSquareOps.has(op)) {
                content.obstacles.push(transformedRect(state.ctm, 0, 0, 1, 1));
            } else if (repeatOps.has(op)) {
                const scaleX = args[1];
                const scaleY = args[2];
                const positions: number[] = args[3];
                for (let p = 0; p + 1 < positions.length; p += 2) {
                    content.obstacles.push(
                        transformedRect(
                            state.ctm,
                            positions[p],
                            positions[p + 1],
                            positions[p] + scaleX,
                            positions[p + 1] + scaleY,
                        ),
                    );
                }
            } else if (wholePageOps.has(op)) {
                content.obstacles.push(wholePage);
            }
        }
        return content;
    } catch (e: any) {
        throw new SigningError(
            'INVALID_PDF',
            'The PDF page could not be analysed: ' + (e && e.message),
        );
    } finally {
        if (doc) await doc.destroy();
        else await loadingTask.destroy();
    }
}
