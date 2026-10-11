import { PDFContext, PDFDict, PDFName, PDFNumber, PDFObjectParser, PDFRawStream, PDFRef } from 'pdf-lib';
import ByteStream from 'pdf-lib/cjs/core/parser/ByteStream';
import { SigningError } from './SigningError';

/** Placeholder written by prepare() and patched in place once the file layout is known. */
export const BYTERANGE_PLACEHOLDER_VALUE = 1000000000;
const BYTERANGE_PLACEHOLDER = new RegExp(
    `/ByteRange\\s*\\[\\s*0\\s+${BYTERANGE_PLACEHOLDER_VALUE}\\s+${BYTERANGE_PLACEHOLDER_VALUE}\\s+${BYTERANGE_PLACEHOLDER_VALUE}\\s*\\]`,
    'g',
);
const BYTERANGE_ANY = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;

export interface ByteRange {
    /** The four numbers of /ByteRange. */
    values: [number, number, number, number];
    /** Offset of `<` of the /Contents hex string (= values[1]). */
    contentsStart: number;
    /** Offset just after `>` of the /Contents hex string (= values[2]). */
    contentsEnd: number;
}

/** All /ByteRange arrays of the file, in file order. */
export function readByteRanges(pdf: Buffer): ByteRange[] {
    const text = pdf.toString('latin1');
    const result: ByteRange[] = [];
    BYTERANGE_ANY.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BYTERANGE_ANY.exec(text)) !== null) {
        const values = [1, 2, 3, 4].map((i) => Number(match![i])) as ByteRange['values'];
        result.push({
            values,
            contentsStart: values[1],
            contentsEnd: values[2],
        });
    }
    return result;
}

/** The bytes covered by a signature: everything except the /Contents hex string. */
export function signedBytes(pdf: Buffer, range: ByteRange): Buffer {
    const [from1, length1, from2, length2] = range.values;
    return Buffer.concat([
        pdf.subarray(from1, from1 + length1),
        pdf.subarray(from2, from2 + length2),
    ]);
}

/**
 * Fills the placeholder /ByteRange of a freshly saved PDF with the real layout. The new text has
 * the same length as the placeholder (padded with spaces), so no offset in the file moves.
 * `hexLength` is the number of hex digits reserved inside `<...>`.
 */
export function patchByteRange(
    pdf: Buffer,
    hexLength: number,
    searchFrom = 0,
    searchEnd = pdf.length,
): { pdf: Buffer; range: ByteRange } {
    const text = pdf.subarray(searchFrom, searchEnd).toString('latin1');
    const matches = text.match(BYTERANGE_PLACEHOLDER);
    if (!matches || matches.length !== 1) {
        throw new SigningError(
            'INVALID_PDF',
            'Expected exactly one signature placeholder in the saved PDF.',
        );
    }
    const placeholder = matches[0];
    const placeholderAt = searchFrom + text.indexOf(placeholder);
    const contentsNeedle = '/Contents <' + '0'.repeat(hexLength) + '>';
    const contentsAt = text.indexOf(contentsNeedle);
    if (contentsAt === -1 || text.indexOf(contentsNeedle, contentsAt + 1) !== -1) {
        throw new SigningError(
            'INVALID_PDF',
            'Expected exactly one /Contents placeholder in the saved PDF.',
        );
    }
    const contentsStart = searchFrom + contentsAt + '/Contents '.length;
    const contentsEnd = contentsStart + hexLength + 2;
    const values: ByteRange['values'] = [
        0,
        contentsStart,
        contentsEnd,
        pdf.length - contentsEnd,
    ];
    const replacement = `/ByteRange [${values.join(' ')}`;
    if (replacement.length + 1 > placeholder.length) {
        throw new SigningError('INVALID_PDF', 'ByteRange placeholder too short.');
    }
    const padded = replacement.padEnd(placeholder.length - 1, ' ') + ']';
    const out = Buffer.from(pdf);
    out.write(padded, placeholderAt, 'latin1');
    return { pdf: out, range: { values, contentsStart, contentsEnd } };
}

export interface LastTrailer {
    offset: number;
    stream: boolean;
    size: number;
    dict: PDFDict;
}

/** Only the last xref's trailer is needed; pdfjs checks the reachable graph after appending. */
export function readLastTrailer(pdf: Buffer): LastTrailer {
    try {
        const text = pdf.toString('latin1');
        const end = /startxref\s+(\d+)\s+%%EOF(?:\r\n|\r|\n)?$/.exec(text);
        if (!end) throw new Error('Missing final startxref.');
        const offset = Number(end[1]);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= end.index) {
            throw new Error('Invalid startxref offset.');
        }
        let at = offset;
        const stream = !/^xref\b/.test(text.slice(at));
        if (stream) {
            const header = /^(\d+)\s+(\d+)\s+obj\b\s*/.exec(text.slice(at));
            if (!header) throw new Error('startxref does not point to an object.');
            at += header[0].length;
        } else {
            at += 4;
            while (true) {
                const section = /^\s*(\d+)\s+(\d+)\s+/.exec(text.slice(at));
                if (!section) break;
                at += section[0].length;
                const count = Number(section[2]);
                if (!Number.isSafeInteger(count) || count > pdf.length / 18) {
                    throw new Error('Invalid xref subsection size.');
                }
                for (let i = 0; i < count; i++) {
                    const entry = /^\d{10}[ \t]+\d{5}[ \t]+[nf](?:[ \t]*\r?\n|[ \t]*\r)/.exec(text.slice(at));
                    if (!entry) throw new Error('Invalid xref entry.');
                    at += entry[0].length;
                }
            }
            const trailer = /^\s*trailer\b\s*/.exec(text.slice(at));
            if (!trailer) throw new Error('Missing last trailer.');
            at += trailer[0].length;
        }
        const bytes = ByteStream.of(pdf);
        bytes.moveTo(at);
        const object = PDFObjectParser.forByteStream(bytes, PDFContext.create()).parseObject();
        const dict = object instanceof PDFRawStream ? object.dict : object;
        if (!(dict instanceof PDFDict) || (stream && (!(object instanceof PDFRawStream) ||
            dict.get(PDFName.of('Type')) !== PDFName.of('XRef') ||
            !/^\s*endobj\b/.test(text.slice(bytes.offset()))))) {
            throw new Error('Invalid last xref dictionary.');
        }
        if (dict.has(PDFName.of('Encrypt'))) {
            throw new SigningError('ENCRYPTED_PDF', 'The PDF is encrypted.');
        }
        if (dict.has(PDFName.of('XRefStm'))) throw new Error('Hybrid xref is unsupported.');
        const sizeObject = dict.get(PDFName.of('Size'));
        const size = sizeObject instanceof PDFNumber ? sizeObject.asNumber() : NaN;
        if (!Number.isInteger(size) || size < 1 || size > 2147483647 ||
            !(dict.get(PDFName.of('Root')) instanceof PDFRef)) {
            throw new Error('Missing or invalid Size/Root in last trailer.');
        }
        return { offset, stream, size, dict };
    } catch (e: any) {
        if (e instanceof SigningError) throw e;
        throw new SigningError('PDF_INCREMENTAL_UNSUPPORTED', 'Cannot append to this PDF: ' + e.message);
    }
}
