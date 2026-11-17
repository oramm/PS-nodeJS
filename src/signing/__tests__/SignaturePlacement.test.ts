import { prepare } from '..';
import { extractPageContent } from '../PdfPageAnalyzer';
import { SIGNATURE_HEIGHT_REL, SIGNATURE_WIDTH_REL, collides } from '../SignaturePlacement';
import { TestIdentity, createTestIdentity } from './testPki';
import { FixtureOptions, makeFixture, widgets } from './testPdfs';

/**
 * Port of Invoke-LetterClosingTests.ps1 (drive-szafir-sign skill): the same fixtures and the same
 * expectations, so the server places the graphic where the local skill would. The page is A4
 * (595 x 842 points); the closing is 10 pt Open Sans.
 */
const NOW = new Date('2026-10-09T10:15:30Z');
const PAGE_W = 595;
const PAGE_H = 842;
const CLOSING = { x: 400, y: 400, text: 'Z poważaniem,' };

let identity: TestIdentity;

beforeAll(async () => {
    identity = await createTestIdentity('Jan Testowy');
});

async function place(
    options: FixtureOptions,
    placement: Parameters<typeof prepare>[2] = 'letterClosing',
) {
    const pdf = await makeFixture(options);
    return prepare(pdf, identity.chainDer, placement, { now: NOW });
}

// The message is asserted too: a refusal for the wrong reason would hide a broken detector.
const blocked = (options: FixtureOptions, reason: RegExp) =>
    expect(place(options)).rejects.toMatchObject({
        code: 'PLACEMENT_BLOCKED',
        message: expect.stringMatching(reason),
    });

/** The chosen rectangle overlaps nothing on the page of the fixture (independent re-analysis). */
async function expectFree(
    result: Awaited<ReturnType<typeof place>>,
    options: FixtureOptions,
) {
    const pdf = await makeFixture(options);
    const content = await extractPageContent(pdf, result.pages, PAGE_W, PAGE_H);
    expect(collides(result.placement.rect!, content.obstacles)).toBe(false);
}

/** Y of the top edge of a rectangle measured from the top of the page, relative (skill's Y). */
const topRel = (rect: { y: number; height: number }) =>
    (PAGE_H - (rect.y + rect.height)) / PAGE_H;

describe('letter closing placement (port of the skill test cases)', () => {
    it('places the graphic directly below a standalone closing', async () => {
        const result = await place({
            lines: [CLOSING, { x: 60, y: 60, text: 'Stopka' }],
        });
        const rect = result.placement.rect!;

        expect(result.placement.source).toBe('letter_closing');
        expect(result.placement.page).toBe(1);
        // skill: SuggestedRectangle.Y between 0.52 and 0.55, Height 0.06
        expect(topRel(rect)).toBeGreaterThan(0.52);
        expect(topRel(rect)).toBeLessThan(0.55);
        expect(rect.height).toBeCloseTo(SIGNATURE_HEIGHT_REL * PAGE_H, 6);
        expect(rect.width).toBeCloseTo(SIGNATURE_WIDTH_REL * PAGE_W, 6);
        // starts at the left edge of the closing text
        expect(rect.x).toBeCloseTo(400, 6);
        // below the text: the closing baseline is at y = 400
        expect(rect.y + rect.height).toBeLessThan(400 - 2);
    });

    it('matches a closing that the PDF writer split into several text chunks', async () => {
        const result = await place({
            lines: [
                { x: 400, y: 400, text: 'Z ' },
                { x: 410, y: 400, text: 'poważaniem,' },
            ],
        });
        expect(result.placement.source).toBe('letter_closing');
    });

    it('accepts the alternative closing "Z wyrazami szacunku"', async () => {
        const result = await place({
            lines: [{ x: 400, y: 400, text: 'Z wyrazami szacunku' }],
        });
        expect(result.placement.source).toBe('letter_closing');
    });

    it('does not treat a closing inside body prose as an anchor', async () => {
        const result = await place({
            lines: [
                {
                    x: 60,
                    y: 400,
                    text: 'Z poważaniem odnosimy się do stanowiska Wykonawcy.',
                },
            ],
        });
        expect(result.placement.source).toBe('last_page_corner');
        expect(result.placement.fallbackReason).toMatch(/closing/);
    });

    it('does not treat the word "Wykonawca" in prose as an anchor', async () => {
        const result = await place({
            lines: [{ x: 60, y: 500, text: 'Wykonawca przedstawi dokumenty.' }],
        });
        expect(result.placement.source).toBe('last_page_corner');
    });

    it('falls back to a free area when the closing leaves no room above the footer', async () => {
        const result = await place({ lines: [{ x: 400, y: 100, text: 'Z poważaniem' }] });
        expect(result.placement.source).toBe('fallback_free_area');
        expect(result.placement.fallbackReason).toMatch(/insufficient space/);
        await expectFree(result, { lines: [{ x: 400, y: 100, text: 'Z poważaniem' }] });
    });

    it('treats short text right under the closing as the signer block and goes below it', async () => {
        const result = await place({
            lines: [CLOSING, { x: 400, y: 370, text: 'Tekst pod zwrotem' }],
        });
        expect(result.placement.source).toBe('letter_closing');
        expect(result.placement.rect!.y + result.placement.rect!.height).toBeLessThan(370 - 2);
    });

    it('falls back to a free area when long body text sits right below the closing', async () => {
        const options = {
            lines: [
                CLOSING,
                {
                    x: 150,
                    y: 370,
                    text: 'Tekst pod zwrotem jest zbyt dlugi, zeby byc blokiem podpisu - to akapit tresci, a nie imie.',
                },
            ],
        };
        const result = await place(options);
        expect(result.placement.source).toBe('fallback_free_area');
        expect(result.placement.fallbackReason).toMatch(/overlap/);
        await expectFree(result, options);
    });

    it('falls back to a free area below a rule drawn under the closing (nearest free place)', async () => {
        const options = { lines: [CLOSING], rule: true };
        const result = await place(options);
        expect(result.placement.source).toBe('fallback_free_area');
        await expectFree(result, options);
        // nearest: right under the rule at y = 370, not somewhere at the page bottom
        expect(result.placement.rect!.y + result.placement.rect!.height).toBeLessThan(370);
        expect(result.placement.rect!.y + result.placement.rect!.height).toBeGreaterThan(355);
    });

    it('falls back to a free area when an image is below the closing', async () => {
        const options = { lines: [CLOSING], image: true };
        const result = await place(options);
        expect(result.placement.source).toBe('fallback_free_area');
        await expectFree(result, options);
    });

    it('falls back to a free area when the page has more than one closing', async () => {
        const options = {
            lines: [
                { x: 400, y: 600, text: 'Z poważaniem' },
                { x: 400, y: 400, text: 'Z poważaniem' },
            ],
        };
        const result = await place(options);
        expect(result.placement.source).toBe('fallback_free_area');
        expect(result.placement.fallbackReason).toMatch(/Multiple letter closings/);
        await expectFree(result, options);
    });

    it('does not mistake a drawn line far from the closing for a whole-page obstacle', async () => {
        // regression: pdfjs returns path bounds as a Float32Array; treating that as "unknown
        // bounds" blocked every letter that had any rule or table border
        const result = await place({
            lines: [CLOSING],
            rule: true,
            ruleAt: { y: 700, x0: 60, x1: 300 },
        });
        expect(result.placement.source).toBe('letter_closing');
    });

    it('refuses a rotated page', async () => {
        await blocked({ lines: [CLOSING], rotated: true }, /Rotated or offset/);
    });

    it('refuses a page whose crop box differs from the media box', async () => {
        await blocked({ lines: [CLOSING], crop: true }, /Rotated or offset/);
    });

    it('control: a grey page background IS an obstacle (so the white one is really seen and ignored)', async () => {
        await blocked({ lines: [CLOSING], greyBackground: true }, /No free area/);
    });

    it('does not treat a white CMYK page background as an obstacle', async () => {
        const result = await place({ lines: [CLOSING], whiteBackground: true });
        expect(result.placement.source).toBe('letter_closing');
    });

    it('does not treat a clip-only path as an obstacle', async () => {
        const result = await place({ lines: [CLOSING], clip: true });
        expect(result.placement.source).toBe('letter_closing');
    });

    it('searches only the last page: a closing on an earlier page is not used', async () => {
        const result = await place({ lines: [CLOSING], twoPages: true });
        expect(result.placement.source).toBe('last_page_corner');
        expect(result.placement.page).toBe(2);
        expect(result.placement.fallbackReason).toMatch(/last page/);
    });

    it('honours an explicit page and rectangle and skips the collision checks', async () => {
        const rect = { x: 59.5, y: 168.5, width: 166.6, height: 84.2 };
        const pdf = await makeFixture({
            lines: [CLOSING, { x: 400, y: 370, text: 'Tekst pod zwrotem' }],
            twoPages: true,
        });
        const result = await prepare(pdf, identity.chainDer, { page: 1, rect }, { now: NOW });

        expect(result.placement).toEqual({ source: 'explicit', page: 1, rect });
        expect(result.preparedPdf.length).toBeGreaterThan(0);
        const found = await widgets(result.preparedPdf);
        expect(found).toHaveLength(1);
        expect(found[0].page).toBe(1);
        expect(found[0].rect).toEqual([59.5, 168.5, 59.5 + 166.6, 168.5 + 84.2]);
    });

    it('rejects an explicit placement with a page outside the document', async () => {
        const pdf = await makeFixture({ lines: [CLOSING] });
        await expect(
            prepare(pdf, identity.chainDer, {
                page: 2,
                rect: { x: 10, y: 10, width: 100, height: 40 },
            }),
        ).rejects.toMatchObject({ code: 'INVALID_PLACEMENT' });
    });
});

describe('last page corner placement', () => {
    it('goes to the bottom right of the last page', async () => {
        const result = await place({ lines: [CLOSING] }, 'lastPageCorner');
        const rect = result.placement.rect!;

        expect(result.placement.source).toBe('last_page_corner');
        expect(rect.x + rect.width).toBeCloseTo(0.92 * PAGE_W, 6);
        expect(rect.y).toBeCloseTo(0.1 * PAGE_H, 6);
    });

    it('moves up above a footer in the corner instead of overlapping it', async () => {
        const result = await place(
            { lines: [{ x: 420, y: 100, text: 'Stopka w prawym rogu' }] },
            'lastPageCorner',
        );
        const rect = result.placement.rect!;
        expect(rect.y).toBeGreaterThan(100 + 8); // above the footer text with a margin
    });

    it('refuses when the whole corner column is occupied', async () => {
        const lines = [];
        for (let y = 60; y < 800; y += 14) {
            lines.push({ x: 380, y, text: 'Kolumna tekstu zajmuje caly prawy dolny rog' });
        }
        await expect(place({ lines }, 'lastPageCorner')).rejects.toMatchObject({
            code: 'PLACEMENT_BLOCKED',
        });
    });
});

describe('no graphic', () => {
    it('keeps the page untouched visually and the field invisible', async () => {
        const result = await place({ lines: [CLOSING] }, 'none');
        expect(result.placement).toEqual({ source: 'none' });
        const found = await widgets(result.preparedPdf);
        expect(found).toEqual([{ rect: [0, 0, 0, 0], hasAppearance: false, page: 1 }]);
    });
});

/**
 * Synthetic replicas of the two real PS letter layouts that the first rules refused (SIG-1 check
 * on six real letters, 2026-10-09): the template prints the signer's function and name under the
 * closing, then a gap, then a left-aligned "Do wiadomości:" block. Coordinates mimic the real
 * pages (A4, closing at x = 402); no client text is used.
 */
describe('signature block under the closing (D-SIG-5 amendment)', () => {
    const DO_WIADOMOSCI = [
        { x: 70.8, y: 252.5, text: 'Do wiadomości:' },
        { x: 70.8, y: 236, text: 'Adresat kopii' },
        { x: 70.8, y: 219.5, text: 'ul. Przykładowa 1, 00-000 Miasto' },
    ];
    const lowestBlockLine = (lines: Array<{ y: number }>) => Math.min(...lines.map((l) => l.y));

    it('letter with a function line and a name under the closing: graphic goes below the name', async () => {
        const block = [
            { x: 369.1, y: 328.6, text: 'Kierownik Zespołu Inżyniera,' },
            { x: 406.4, y: 313.6, text: 'Imię Nazwisko' },
        ];
        const options = {
            lines: [{ x: 402.1, y: 349.6, text: 'Z poważaniem,' }, ...block, ...DO_WIADOMOSCI],
        };
        const result = await place(options);
        const rect = result.placement.rect!;

        expect(result.placement.source).toBe('letter_closing');
        // directly below the last block line (its baseline is 313.6), with the 6 pt gap
        expect(rect.y + rect.height).toBeLessThan(lowestBlockLine(block) - 2);
        expect(rect.y + rect.height).toBeGreaterThan(lowestBlockLine(block) - 12);
        await expectFree(result, options);
    });

    it('letter with a name and a function under the closing: graphic goes below the second line', async () => {
        const block = [
            { x: 406.4, y: 400.6, text: 'Imię Nazwisko' },
            { x: 395.1, y: 387.1, text: 'Inżynier Kontraktu' },
        ];
        const options = {
            lines: [{ x: 402.1, y: 414.1, text: 'Z poważaniem,' }, ...block, ...DO_WIADOMOSCI],
        };
        const result = await place(options);
        const rect = result.placement.rect!;

        expect(result.placement.source).toBe('letter_closing');
        expect(rect.y + rect.height).toBeLessThan(387.1 - 2);
        expect(rect.y + rect.height).toBeGreaterThan(387.1 - 12);
        await expectFree(result, options);
    });

    it('a left-margin line right under the closing ends the block', async () => {
        const options = {
            lines: [CLOSING, { x: 70.8, y: 385, text: 'Do wiadomości:' }, { x: 70.8, y: 369, text: 'Adresat' }],
        };
        const result = await place(options);
        expect(result.placement.source).toBe('letter_closing');
        // directly below the closing, not below the margin lines
        expect(result.placement.rect!.y + result.placement.rect!.height).toBeGreaterThan(385);
    });

    it('a big gap ends the block: a distant line in the same column is ignored', async () => {
        const options = { lines: [CLOSING, { x: 400, y: 300, text: 'Daleki tekst w tej samej kolumnie' }] };
        const result = await place(options);
        expect(result.placement.source).toBe('letter_closing');
        expect(result.placement.rect!.y + result.placement.rect!.height).toBeGreaterThan(385);
        await expectFree(result, options);
    });

    it('takes at most three block lines: a fourth line under the block takes the place', async () => {
        const options = {
            lines: [
                CLOSING,
                { x: 400, y: 386, text: 'Linia pierwsza' },
                { x: 400, y: 372, text: 'Linia druga' },
                { x: 400, y: 358, text: 'Linia trzecia' },
                { x: 400, y: 344, text: 'Linia czwarta' },
            ],
        };
        const result = await place(options);
        expect(result.placement.source).toBe('fallback_free_area');
        await expectFree(result, options);
    });

    it('block that runs down to the footer: falls back to a free area on the last page, over no content', async () => {
        const options = {
            lines: [
                { x: 402, y: 150, text: 'Z poważaniem,' },
                { x: 369, y: 136, text: 'Kierownik Zespołu Inżyniera,' },
                { x: 406, y: 122, text: 'Imię Nazwisko' },
                { x: 60, y: 70, text: 'Stopka przez cala szerokosc strony ................................................ ................................................ ................................................' },
            ],
        };
        const result = await place(options);

        expect(result.placement.source).toBe('fallback_free_area');
        expect(result.placement.page).toBe(1);
        expect(result.placement.fallbackReason).toBeTruthy();
        await expectFree(result, options);
    });

    it('still throws when there is no free area at all', async () => {
        await blocked({ lines: [CLOSING], greyBackground: true }, /No free area/);
    });
});
