import { Box, PageContent, TextChunk } from './PdfPageAnalyzer';
import { PdfRect } from './SigningTypes';

/**
 * Port of the placement rules of the drive-szafir-sign skill (LetterClosingFinder.cs and
 * visible-signature-placement.ps1), extended with the signature block rule (D-SIG-5 amendment,
 * 2026-10-09): the PS letter template prints the signer's name and function directly under the
 * closing, so the graphic goes below that block. Positions are relative to the page like in the
 * skill, so the numbers in the skill's test cases carry over unchanged.
 */
export const SIGNATURE_WIDTH_REL = 0.28;
export const SIGNATURE_HEIGHT_REL = 0.06;
const MARGIN_X_REL = 0.04;
/** The rectangle starts this many points below the lowest edge of the closing line / block. */
const GAP_BELOW_CLOSING = 6;
/** The rectangle must end above this fraction of the page height measured from the top (footer). */
const MAX_BOTTOM_REL_FROM_TOP = 0.9;
/** Safety margin when checking for overlap with content. */
const COLLISION_MARGIN = 2;
/** Tolerance when grouping text chunks into lines (points). */
const LINE_TOLERANCE = 2;
/** A gap wider than this between two chunks of one line means a space. */
const WORD_GAP = 1;
/** Signature block: at most this many lines under the closing. */
const MAX_BLOCK_LINES = 3;
/** Signature block: baseline-to-baseline distance up to this many line heights is "normal spacing". */
const MAX_BLOCK_LINE_SPACING = 2.5;
/** Signature block: a line wider than this share of the page is body text, not a name. */
const MAX_BLOCK_LINE_WIDTH_REL = 0.45;
/** Signature block: a line starting this close to the page's left text edge is in the margin column. */
const LEFT_COLUMN_SLACK = 30;
/** Where the left text edge is assumed to be when no line starts further left (of the page width). */
const DEFAULT_MARGIN_REL = 0.12;
/** Fallback search step (points) and the left limit of its "right half". */
const SEARCH_STEP = 4;
const FALLBACK_MIN_LEFT_REL = 0.4;

// "Wykonawca" in body prose is not an anchor: only a whole line that is the closing counts.
const CLOSING_LINE = /^(Z poważaniem|Z wyrazami szacunku)[,.!]?\s*$/iu;

export type ClosingSearch =
    | { found: false }
    | { found: true; text: string; rect: PdfRect; blockLines: number }
    | {
          found: true;
          failure: string;
          /** Lowest edge of the closing / signature block and its left edge, when known. */
          anchor?: { bottom: number; left: number };
      };

interface TextLine {
    text: string;
    left: number;
    right: number;
    bottom: number;
    top: number;
    baseline: number;
}

function overlaps(rect: PdfRect, box: Box, margin: number): boolean {
    return (
        rect.x < box.right + margin &&
        rect.x + rect.width > box.left - margin &&
        rect.y < box.top + margin &&
        rect.y + rect.height > box.bottom - margin
    );
}

export function collides(rect: PdfRect, obstacles: Box[]): boolean {
    return obstacles.some((box) => overlaps(rect, box, COLLISION_MARGIN));
}

/** Text chunks to lines, top of the page first; chunks of a line left to right. */
function groupLines(chunks: TextChunk[]): TextLine[] {
    const sorted = chunks.slice().sort((a, b) => b.baselineY - a.baselineY);
    const lines: TextLine[] = [];
    for (let i = 0; i < sorted.length; ) {
        const baseline = sorted[i].baselineY;
        const members: TextChunk[] = [];
        while (
            i < sorted.length &&
            Math.abs(sorted[i].baselineY - baseline) < LINE_TOLERANCE
        ) {
            members.push(sorted[i++]);
        }
        members.sort((a, b) => a.box.left - b.box.left);

        let text = '';
        let previousRight = NaN;
        for (const chunk of members) {
            if (!isNaN(previousRight) && chunk.box.left - previousRight > WORD_GAP) {
                text += ' ';
            }
            text += chunk.text;
            previousRight = chunk.box.right;
        }
        lines.push({
            text: text.replace(/\s+/g, ' ').trim(),
            left: members[0].box.left,
            right: Math.max(...members.map((m) => m.box.right)),
            bottom: Math.min(...members.map((m) => m.box.bottom)),
            top: Math.max(...members.map((m) => m.box.top)),
            baseline,
        });
    }
    return lines;
}

/**
 * Lines that belong to the signer's block: up to MAX_BLOCK_LINES short lines directly under the
 * closing, in the closing's column (overlapping its horizontal span, not in the left margin
 * column), at normal line spacing. A left-margin line (like "Do wiadomości:") or a big gap ends it.
 */
function signatureBlock(
    lines: TextLine[],
    closingIndex: number,
    allLines: TextLine[],
    pageWidth: number,
): TextLine[] {
    const closing = lines[closingIndex];
    // The left text edge of the page; a page with only right-aligned text still has a margin.
    const marginLeft = Math.min(
        ...allLines.map((l) => l.left),
        DEFAULT_MARGIN_REL * pageWidth,
    );
    const maxGap = MAX_BLOCK_LINE_SPACING * (closing.top - closing.bottom);
    const block: TextLine[] = [];
    let previous = closing;
    for (let i = closingIndex + 1; i < lines.length && block.length < MAX_BLOCK_LINES; i++) {
        const line = lines[i];
        const inColumn = line.left < closing.right && line.right > closing.left;
        const short = line.right - line.left <= MAX_BLOCK_LINE_WIDTH_REL * pageWidth;
        const notMargin = line.left > marginLeft + LEFT_COLUMN_SLACK;
        const spacedNormally = previous.baseline - line.baseline <= maxGap;
        if (!inColumn || !short || !notMargin || !spacedNormally) break;
        block.push(line);
        previous = line;
    }
    return block;
}

/**
 * Looks for a standalone closing on the page and, if there is exactly one, returns the rectangle
 * directly below it (and below the signer's block, when there is one). A closing that is found but
 * cannot take the signature returns a `failure`, never a different position: the caller decides
 * what to do (the library falls back to a free area).
 */
export function findLetterClosing(
    content: PageContent,
    pageWidth: number,
    pageHeight: number,
): ClosingSearch {
    const lines = groupLines(content.chunks);
    const closingIndexes = lines
        .map((line, index) => (CLOSING_LINE.test(line.text) ? index : -1))
        .filter((index) => index >= 0);
    if (closingIndexes.length === 0) return { found: false };
    // A second closing is ambiguous (for example quoted correspondence).
    if (closingIndexes.length > 1) {
        return {
            found: true,
            failure:
                'Multiple letter closings on the last page; specify a manual rectangle.',
        };
    }
    const closingIndex = closingIndexes[0];
    const closing = lines[closingIndex];
    const block = signatureBlock(lines, closingIndex, lines, pageWidth);
    const bottom = Math.min(closing.bottom, ...block.map((l) => l.bottom));

    const widthRel = SIGNATURE_WIDTH_REL;
    const x = Math.max(
        MARGIN_X_REL,
        Math.min(closing.left / pageWidth, 1 - MARGIN_X_REL - widthRel),
    );
    const anchor = { bottom, left: x * pageWidth };
    const yFromTop = (pageHeight - bottom + GAP_BELOW_CLOSING) / pageHeight;
    if (yFromTop + SIGNATURE_HEIGHT_REL > MAX_BOTTOM_REL_FROM_TOP) {
        return {
            found: true,
            failure:
                'Letter closing leaves insufficient space above the footer; specify a manual rectangle.',
            anchor,
        };
    }
    const rect: PdfRect = {
        x: x * pageWidth,
        y: pageHeight - (yFromTop + SIGNATURE_HEIGHT_REL) * pageHeight,
        width: widthRel * pageWidth,
        height: SIGNATURE_HEIGHT_REL * pageHeight,
    };
    if (collides(rect, content.obstacles)) {
        return {
            found: true,
            failure:
                'Signature below letter closing would overlap page content; specify a manual rectangle.',
            anchor,
        };
    }
    return { found: true, text: closing.text, rect, blockLines: block.length };
}

/**
 * Bottom right corner of the page (right edge at 92 percent of the width), moved up in steps
 * until it overlaps no content. Returns undefined when there is no free spot.
 */
export function findCornerRect(
    content: PageContent,
    pageWidth: number,
    pageHeight: number,
): PdfRect | undefined {
    const width = SIGNATURE_WIDTH_REL * pageWidth;
    const height = SIGNATURE_HEIGHT_REL * pageHeight;
    const x = 0.92 * pageWidth - width;
    for (
        let bottom = 0.1 * pageHeight;
        bottom + height <= 0.92 * pageHeight;
        bottom += SEARCH_STEP
    ) {
        const rect: PdfRect = { x, y: bottom, width, height };
        if (!collides(rect, content.obstacles)) return rect;
    }
    return undefined;
}

/**
 * Nearest free rectangle of the standard size when the closing rule cannot be applied. Searches
 * the right part of the page from just below `anchor` (closing or signature block) downwards,
 * then falls back to the corner search from the bottom of the page upwards. Never overlaps
 * content; undefined when there is no free area at all.
 */
export function findFreeArea(
    content: PageContent,
    pageWidth: number,
    pageHeight: number,
    anchor?: { bottom: number; left: number },
): PdfRect | undefined {
    const width = SIGNATURE_WIDTH_REL * pageWidth;
    const height = SIGNATURE_HEIGHT_REL * pageHeight;
    if (anchor) {
        const rightmost = 0.92 * pageWidth - width;
        const xs = [Math.min(anchor.left, rightmost), rightmost];
        for (
            let x = rightmost - 0.02 * pageWidth;
            x >= FALLBACK_MIN_LEFT_REL * pageWidth;
            x -= 0.02 * pageWidth
        ) {
            xs.push(x);
        }
        const bottomLimit = 0.03 * pageHeight;
        for (
            let top = anchor.bottom - GAP_BELOW_CLOSING;
            top - height >= bottomLimit;
            top -= SEARCH_STEP
        ) {
            for (const x of xs) {
                const rect: PdfRect = { x, y: top - height, width, height };
                if (!collides(rect, content.obstacles)) return rect;
            }
        }
    }
    return findCornerRect(content, pageWidth, pageHeight);
}
