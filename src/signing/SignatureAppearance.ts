import { PDFDocument, PDFFont, PDFImage, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadSigningAssets } from './SigningAssets';
import { PdfRect } from './SigningTypes';

const CAPTION = 'Signed by / Podpisano przez:';
const CAPTION_SIZE = 7.5;
const NAME_SIZE = 9.5;
const NAME_MIN_SIZE = 6.5;
const DATE_SIZE = 7.5;
const CAPTION_GREY = '0.306 0.306 0.306 rg';
const NAME_GREY = '0.133 0.133 0.133 rg';
/** Text column starts this far right of the icon. */
const ICON_GAP = 8;

/**
 * Date as printed in the appearance, `yyyy-MM-dd HH:mm:ss`, in a fixed time zone, so the output
 * never depends on the server's TZ variable (Heroku runs in UTC, the reader lives in Warsaw).
 */
export function formatSigningDate(now: Date, timeZone: string): string {
    const parts: Record<string, string> = {};
    new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    })
        .formatToParts(now)
        .forEach((p) => {
            parts[p.type] = p.value;
        });
    return (
        `${parts.year}-${parts.month}-${parts.day} ` +
        `${parts.hour}:${parts.minute}:${parts.second}`
    );
}

/** Shortens `text` with an ellipsis until it fits `maxWidth`; the font size shrinks first. */
function fitName(
    font: PDFFont,
    text: string,
    maxWidth: number,
): { text: string; size: number } {
    let size = NAME_SIZE;
    while (size > NAME_MIN_SIZE && font.widthOfTextAtSize(text, size) > maxWidth) {
        size -= 0.5;
    }
    let shown = text;
    while (shown.length > 1 && font.widthOfTextAtSize(shown, size) > maxWidth) {
        shown = shown.slice(0, -1);
        if (font.widthOfTextAtSize(shown + '…', size) <= maxWidth) {
            shown += '…';
            break;
        }
    }
    return { text: shown, size };
}

/**
 * Visible signature: ENVI symbol on the left, three lines on the right (caption, signer name,
 * date) on a transparent background. Same look as the drive-szafir-sign skill (icon cell 21 percent
 * of the width, text 7.5 / 9.5 bold / 7.5 pt) but with an embedded TTF, so Polish diacritics in the
 * name render.
 *
 * Fonts are embedded with a fixed subset name: pdf-lib would otherwise add a random suffix and the
 * output would differ on every run.
 */
export async function createAppearanceStream(
    pdfDoc: PDFDocument,
    rect: PdfRect,
    signerName: string,
    signedAt: string,
): Promise<PDFRef> {
    const assets = loadSigningAssets();
    pdfDoc.registerFontkit(fontkit);
    const regular = await pdfDoc.embedFont(assets.fontRegular, {
        subset: true,
        customName: 'ABCDEF+OpenSans',
    });
    const bold = await pdfDoc.embedFont(assets.fontBold, {
        subset: true,
        customName: 'GHIJKL+OpenSans-Bold',
    });
    const icon: PDFImage = await pdfDoc.embedPng(assets.icon);

    const { width, height } = rect;
    const iconSize = Math.min(height * 0.86, width * 0.21);
    const iconY = (height - iconSize) / 2;
    const textX = iconSize + ICON_GAP;
    const textWidth = width - textX - 2;

    const name = fitName(bold, signerName, textWidth);
    const lineHeight = (size: number) => size * 1.15;
    const total =
        lineHeight(CAPTION_SIZE) + lineHeight(name.size) + lineHeight(DATE_SIZE);
    const ascent = 0.88;
    let cursor = (height + total) / 2;
    const baseline = (size: number) => {
        const y = cursor - size * ascent;
        cursor -= lineHeight(size);
        return y;
    };
    const num = (n: number) => (Math.round(n * 1000) / 1000).toString();
    const captionY = baseline(CAPTION_SIZE);
    const nameY = baseline(name.size);
    const dateY = baseline(DATE_SIZE);

    const content = [
        'q',
        `${num(iconSize)} 0 0 ${num(iconSize)} 0 ${num(iconY)} cm`,
        '/Im0 Do',
        'Q',
        'BT',
        CAPTION_GREY,
        `/F1 ${CAPTION_SIZE} Tf`,
        `${num(textX)} ${num(captionY)} Td`,
        `${regular.encodeText(CAPTION).toString()} Tj`,
        'ET',
        'BT',
        NAME_GREY,
        `/F2 ${num(name.size)} Tf`,
        `${num(textX)} ${num(nameY)} Td`,
        `${bold.encodeText(name.text).toString()} Tj`,
        'ET',
        'BT',
        CAPTION_GREY,
        `/F1 ${DATE_SIZE} Tf`,
        `${num(textX)} ${num(dateY)} Td`,
        `${regular.encodeText(signedAt).toString()} Tj`,
        'ET',
    ].join('\n');

    const context = pdfDoc.context;
    const stream = context.stream(content, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, width, height],
        Resources: {
            Font: { F1: regular.ref, F2: bold.ref },
            XObject: { Im0: icon.ref },
        },
    });
    return context.register(stream);
}
