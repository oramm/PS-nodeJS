import fs from 'fs';
import path from 'path';
import {
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFName,
    PDFNumber,
    PDFPage,
    clip,
    cmyk,
    degrees,
    endPath,
    rectangle,
    rgb,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { signingAssetsDir } from '../SigningAssets';

export interface FixtureLine {
    x: number;
    y: number;
    text: string;
}

export interface FixtureOptions {
    /** Text lines drawn in 10 pt Open Sans, position of the baseline start. */
    lines: FixtureLine[];
    rule?: boolean;
    /** Position of the rule; default is the one under the standard closing (y 370, x 380-550). */
    ruleAt?: { y: number; x0: number; x1: number };
    image?: boolean;
    twoPages?: boolean;
    rotated?: boolean;
    crop?: boolean;
    whiteBackground?: boolean;
    greyBackground?: boolean;
    clip?: boolean;
}

/**
 * Letter-like fixtures mirroring the cases of Invoke-LetterClosingTests.ps1 from the
 * drive-szafir-sign skill. Plain A4 (595 x 842 points) built with an embedded TTF.
 */
export async function makeFixture(options: FixtureOptions): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
        fs.readFileSync(path.join(signingAssetsDir(), 'OpenSans-Regular.ttf')),
        { subset: true },
    );
    const page: PDFPage = doc.addPage([595, 842]);
    if (options.rotated) page.setRotation(degrees(90));
    if (options.crop) page.setCropBox(20, 20, 550, 800);
    if (options.whiteBackground) {
        page.drawRectangle({
            x: 0,
            y: 0,
            width: 595,
            height: 842,
            color: cmyk(0, 0, 0, 0),
        });
    }
    if (options.greyBackground) {
        page.drawRectangle({
            x: 0,
            y: 0,
            width: 595,
            height: 842,
            color: rgb(0.9, 0.9, 0.9),
        });
    }
    if (options.clip) page.pushOperators(rectangle(0, 0, 595, 842), clip(), endPath());
    for (const line of options.lines) {
        page.drawText(line.text, { x: line.x, y: line.y, size: 10, font, color: rgb(0, 0, 0) });
    }
    if (options.rule) {
        page.drawLine({
            start: { x: options.ruleAt ? options.ruleAt.x0 : 380, y: options.ruleAt ? options.ruleAt.y : 370 },
            end: { x: options.ruleAt ? options.ruleAt.x1 : 550, y: options.ruleAt ? options.ruleAt.y : 370 },
            thickness: 1,
            color: rgb(0, 0, 0),
        });
    }
    if (options.image) {
        const png = await doc.embedPng(
            fs.readFileSync(
                path.join(signingAssetsDir(), 'envi_podpis_symbol_96x96_transparent.png'),
            ),
        );
        page.drawImage(png, { x: 400, y: 350, width: 50, height: 30 });
    }
    if (options.twoPages) doc.addPage([595, 842]);
    return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** Signature widgets of a PDF: rectangle, whether it has an appearance, 1-based page. */
export async function widgets(pdf: Buffer) {
    const doc = await PDFDocument.load(pdf);
    const found: Array<{ rect: number[]; hasAppearance: boolean; page: number }> = [];
    doc.getPages().forEach((page, index) => {
        const annots = page.node.Annots();
        if (!annots) return;
        for (let i = 0; i < annots.size(); i++) {
            const annot = annots.lookup(i, PDFDict);
            if (annot.get(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;
            const rect = annot
                .lookup(PDFName.of('Rect'), PDFArray)
                .asArray()
                .map((n) => (n as PDFNumber).asNumber());
            found.push({
                rect,
                hasAppearance: annot.has(PDFName.of('AP')),
                page: index + 1,
            });
        }
    });
    return found;
}
