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
): { pdf: Buffer; range: ByteRange } {
    const text = pdf.toString('latin1');
    const matches = text.match(BYTERANGE_PLACEHOLDER);
    if (!matches || matches.length !== 1) {
        throw new SigningError(
            'INVALID_PDF',
            'Expected exactly one signature placeholder in the saved PDF.',
        );
    }
    const placeholder = matches[0];
    const placeholderAt = text.indexOf(placeholder);
    const contentsNeedle = '/Contents <' + '0'.repeat(hexLength) + '>';
    const contentsAt = text.indexOf(contentsNeedle);
    if (contentsAt === -1 || text.indexOf(contentsNeedle, contentsAt + 1) !== -1) {
        throw new SigningError(
            'INVALID_PDF',
            'Expected exactly one /Contents placeholder in the saved PDF.',
        );
    }
    const contentsStart = contentsAt + '/Contents '.length;
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
