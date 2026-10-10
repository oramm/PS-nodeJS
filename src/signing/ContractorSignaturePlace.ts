import { PDFDocument, PDFPage } from 'pdf-lib';
import { Box, extractPageContent, isThinPathObstacle, PageContent, TextChunk } from './PdfPageAnalyzer';
import { collides, SIGNATURE_HEIGHT_REL, SIGNATURE_WIDTH_REL } from './SignaturePlacement';
import { SigningError } from './SigningError';
import { PdfRect } from './SigningTypes';

export interface PagePlaceInfo { width: number; height: number; placeable: boolean }
export interface SignaturePlaceCandidate { page: number; rect: PdfRect; label: string }
export interface SignaturePlaceSearch {
    pages: PagePlaceInfo[];
    candidates: SignaturePlaceCandidate[];
    stampRel: { width: number; height: number };
}

export function isPlaceablePage(page: PDFPage): boolean {
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    return page.getRotation().angle % 360 === 0 &&
        media.x === 0 && media.y === 0 &&
        crop.x === media.x && crop.y === media.y &&
        crop.width === media.width && crop.height === media.height;
}

function groupLines(chunks: TextChunk[]): TextChunk[][] {
    const sorted = chunks.slice().sort((a, b) => b.baselineY - a.baselineY);
    const lines: TextChunk[][] = [];
    for (const chunk of sorted) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(line[0].baselineY - chunk.baselineY) < 2) line.push(chunk);
        else lines.push([chunk]);
    }
    return lines.map((line) => line.sort((a, b) => a.box.left - b.box.left));
}

const ANCHOR = /(?:czytelne|czytelny)?(?:podpis\/pieczątka|podpis(?:y|\/-y)?os(?:oby|ób)|elektroniczn(?:y|e)podpisy?|podpisy?wykonawc)/gu;
const DATE_PREFIX = /^(?:miejscowość,?data|[\p{L}.-]+,\d{1,2}[./-]\d{1,2}[./-]\d{4}(?:r\.?)?)$/u;

function startsColumn(previous: TextChunk, next: TextChunk): boolean {
    return next.box.left - previous.box.right > Math.max(8, (next.box.top - next.box.bottom) * 0.75);
}

function pageCandidates(content: PageContent, width: number, height: number, partyHeadings = false): Array<{ rect: PdfRect; label: string }> {
    const candidates: Array<{ rect: PdfRect; label: string }> = [];
    const ignorable = new Set(content.chunks
        .filter((chunk) => /^[.\u2026_\s]+$/u.test(chunk.text))
        .map((chunk) => chunk.box));
    const lines = groupLines(content.chunks);
    for (const line of lines) {
        let text = '';
        const positions: Array<{ chunk: number; offset: number }> = [];
        line.forEach((chunk, index) => {
            for (let offset = 0; offset < chunk.text.length; offset++) {
                if (/\s/u.test(chunk.text[offset])) continue;
                text += chunk.text[offset].toLowerCase();
                positions.push({ chunk: index, offset });
            }
        });
        // W umowie liczy sie tylko naglowek "Wykonawca" stojacy w jednym wierszu z "Zamawiajacy": ogolny napis
        // ("podpis osoby...") moze nalezec do drugiej strony, a naglowki w osobnych wierszach to zwykle opis stron.
        const matches = partyHeadings ? [] : [...text.matchAll(ANCHOR)].map((match) => ({ text: match[0], index: match.index!, party: false }));
        if (partyHeadings && /^zamawiający:?(?:[\p{L}/]{0,25}\/)?wykonawca:?$/u.test(text)) {
            const index = text.match(/^zamawiający:?/u)![0].length;
            matches.push({ text: text.slice(index), index, party: true });
        }
        for (const match of matches) {
            const start = positions[match.index!];
            const prefix = text.slice(0, match.index);
            const columnStart = start.offset === line[start.chunk].text.search(/\S/u) &&
                start.chunk > 0 && startsColumn(line[start.chunk - 1], line[start.chunk]);
            if (!match.party && prefix && !columnStart && !DATE_PREFIX.test(prefix)) continue;
            if (!match.party && match.text.replace(/^czyteln[ey]/u, '').startsWith('elektroniczn') && prefix) continue;

            let lastChunk = positions[match.index! + match.text.length - 1].chunk;
            while (lastChunk + 1 < line.length && !startsColumn(line[lastChunk], line[lastChunk + 1])) lastChunk++;
            while (lastChunk > start.chunk && /^[.\u2026_\s]+$/u.test(line[lastChunk].text)) lastChunk--;
            const members = line.slice(start.chunk, lastChunk + 1);
            const last = members[members.length - 1];
            const labelEnd = last.text.replace(/[.\u2026_\s]+$/u, '').length;
            let label = '';
            members.forEach((chunk, index) => {
                if (index > 0 && chunk.box.left - members[index - 1].box.right > 1) label += ' ';
                label += chunk.text.slice(index === 0 ? start.offset : 0, chunk === last ? labelEnd : undefined);
            });
            label = (match.party ? label : label.replace(/\s+/gu, ' ')).trim();
            // The label is quoted to the user: a cut one ends with an ellipsis, not mid-sentence.
            if (label.length > 60) label = label.slice(0, 59).trimEnd() + '…';
            // shortcut: Partial chunk edges use proportional width; use glyph positions if exact character edges are needed.
            const box: Box = {
                left: members[0].box.left + (members[0].box.right - members[0].box.left) * start.offset / members[0].text.length,
                right: last.box.left + (last.box.right - last.box.left) * labelEnd / last.text.length,
                bottom: Math.min(...members.map((chunk) => chunk.box.bottom)),
                top: Math.max(...members.map((chunk) => chunk.box.top)),
            };
            const obstacles = content.obstacles.filter((obstacle) =>
                !ignorable.has(obstacle) && !isThinPathObstacle(obstacle) &&
                !members.some((chunk) => chunk.box === obstacle) &&
                obstacle.right - obstacle.left > 1.5 && obstacle.top - obstacle.bottom > 1.5);
            const stampWidth = width * SIGNATURE_WIDTH_REL;
            const stampHeight = height * SIGNATURE_HEIGHT_REL;
            const x = Math.max(width * 0.04, Math.min((box.left + box.right - stampWidth) / 2, width * 0.96 - stampWidth));
            const above = box.top + 4;
            const below = box.bottom - 4 - stampHeight;
            const ys = match.party || match.text.endsWith('podpis/pieczątka') ? [below, above] : [above, below];
            const rect = ys.map((y) => ({ x, y, width: stampWidth, height: stampHeight }))
                .find((r) => r.y >= 0 && r.y + r.height <= height && !collides(r, obstacles));
            if (!rect || candidates.some((c) =>
                rect.x < c.rect.x + c.rect.width && rect.x + rect.width > c.rect.x &&
                rect.y < c.rect.y + c.rect.height && rect.y + rect.height > c.rect.y)) continue;
            candidates.push({ rect, label });
        }
    }
    return candidates;
}

export async function findContractorSignaturePlaces(pdfBytes: Buffer, options?: { partyHeadings?: boolean }): Promise<SignaturePlaceSearch> {
    let doc: PDFDocument;
    try {
        doc = await PDFDocument.load(pdfBytes, { updateMetadata: false, ignoreEncryption: true });
    } catch (e: any) {
        throw new SigningError('INVALID_PDF', 'The PDF could not be read: ' + (e && e.message));
    }
    if (doc.isEncrypted) throw new SigningError('ENCRYPTED_PDF', 'The PDF is encrypted.');
    if (doc.getPageCount() === 0) throw new SigningError('INVALID_PDF', 'The PDF has no pages.');
    const result: SignaturePlaceSearch = {
        pages: [], candidates: [],
        stampRel: { width: SIGNATURE_WIDTH_REL, height: SIGNATURE_HEIGHT_REL },
    };
    for (const [index, page] of doc.getPages().entries()) {
        const { width, height } = page.getMediaBox();
        const placeable = isPlaceablePage(page);
        result.pages.push({ width, height, placeable });
        if (!placeable) continue;
        const content = await extractPageContent(pdfBytes, index + 1, width, height);
        result.candidates.push(...pageCandidates(content, width, height, options?.partyHeadings).map((c) => ({ page: index + 1, ...c })));
    }
    return result;
}
