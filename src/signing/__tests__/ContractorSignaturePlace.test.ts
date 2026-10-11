import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { findContractorSignaturePlaces } from '../ContractorSignaturePlace';
import { extractPageContent } from '../PdfPageAnalyzer';
import { collides, SIGNATURE_HEIGHT_REL, SIGNATURE_WIDTH_REL } from '../SignaturePlacement';
import { makeFixture, FixtureOptions } from './testPdfs';

const W = 595;
const H = 842;
const LABEL = { x: 200, y: 400, text: 'Podpis osoby uprawnionej do reprezentacji podmiotu' };
const find = async (options: FixtureOptions) => findContractorSignaturePlaces(await makeFixture(options));

describe('contractor signature places', () => {
    it('rzeczywisty koniec szablonu oferty: grafika nad zatwierdzeniem, bez kolizji z trescia', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 320, y: 200, text: 'Ofertę zatwierdził: Marek Gazda' },
            { x: 320, y: 300, text: 'Pozostala tresc oferty' },
        ] });
        expect((await findContractorSignaturePlaces(pdf)).candidates).toEqual([]);
        const { candidates } = await findContractorSignaturePlaces(pdf, { ownOfferApproval: true });
        expect(candidates).toHaveLength(1);
        const { chunks, obstacles } = await extractPageContent(pdf, 1, W, H);
        expect(candidates[0].rect.y).toBeCloseTo(chunks.find(c => c.text.includes('zatwierdził'))!.box.top + 4);
        expect(collides(candidates[0].rect, obstacles)).toBe(false);
    });

    it('przy zajetym miejscu nie zaslania tresci: pozostawia reczny wybor', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 320, y: 200, text: 'Ofertę zatwierdził: Marek Gazda' },
            { x: 320, y: 225, text: 'Tresc nad blokiem' },
            { x: 320, y: 180, text: 'Tresc pod blokiem' },
        ] });
        expect((await findContractorSignaturePlaces(pdf, { ownOfferApproval: true })).candidates).toEqual([]);
    });

    it('zatwierdzenie liczy sie na koncowej stronie, takze gdy tekst eksportu jest podzielony', async () => {
        const first = await makeFixture({ lines: [{ x: 320, y: 200, text: 'Ofertę zatwierdził: Marek Gazda' }] });
        const last = await makeFixture({ lines: [
            { x: 320, y: 200, text: 'Ofertę zatwierdził:' },
            { x: 410, y: 200, text: ' Marek Gazda' },
        ] });
        const doc = await PDFDocument.load(first);
        doc.addPage((await doc.copyPages(await PDFDocument.load(last), [0]))[0]);
        const result = await findContractorSignaturePlaces(Buffer.from(await doc.save()), { ownOfferApproval: true });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].page).toBe(2);
        expect(result.candidates[0].label).toBe('Ofertę zatwierdził: Marek Gazda');
    });

    it.each([
        'Podpis / pieczątka',
        'Podpis / piecz ą tka',
        'podpis/-y osoby/osób wskazanych w dokumencie uprawniającym do',
        'czytelne podpisy osób wskazanych w dokumencie',
        'czytelny podpis osoby upoważnionej',
        'Podpis osoby uprawnionej do reprezentacji podmiotu',
        'Podpis osoby upoważnionej: ........',
        'ELEKTRONICZNY PODPIS WYKONAWCY lub osoby',
        'ELEKTRONICZNE PODPISY WYKONAWCÓW',
        'ELEKTRONICZNY PODPIS',
        'podpis Wykonawcy',
        'podpisy Wykonawców',
    ])('finds %s with standard size on the preferred side', async (text) => {
        const pdf = await makeFixture({ lines: [{ ...LABEL, text }] });
        const result = await findContractorSignaturePlaces(pdf);
        expect(result.pages).toEqual([{ width: W, height: H, placeable: true }]);
        expect(result.stampRel).toEqual({ width: SIGNATURE_WIDTH_REL, height: SIGNATURE_HEIGHT_REL });
        expect(result.candidates).toHaveLength(1);
        const { rect, label, page } = result.candidates[0];
        expect(page).toBe(1);
        expect(label.length).toBeLessThanOrEqual(60);
        expect(label).not.toMatch(/\s{2}|\.\./u);
        expect(rect.width).toBeCloseTo(W * SIGNATURE_WIDTH_REL);
        expect(rect.height).toBeCloseTo(H * SIGNATURE_HEIGHT_REL);
        const { chunks } = await extractPageContent(pdf, 1, W, H);
        if (text.startsWith('Podpis /')) expect(rect.y + rect.height).toBeCloseTo(chunks[0].box.bottom - 4);
        else expect(rect.y).toBeCloseTo(chunks[0].box.top + 4);
    });

    it('joins words split between chunks', async () => {
        const result = await find({ lines: [
            { x: 200, y: 400, text: 'Pod' },
            { x: 219, y: 400, text: 'pis / piecz ' },
            { x: 271, y: 400, text: 'ą tka' },
        ] });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].label).toMatch(/^Podpis/u);
    });

    it('centres the stamp on the third column, not the whole table heading', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 30, y: 400, text: 'Miejscowość i data' },
            { x: 200, y: 400, text: 'Imię, nazwisko i funkcja osoby' },
            { x: 420, y: 400, text: 'Podpis / piecz ą tka' },
        ] });
        const result = await findContractorSignaturePlaces(pdf);
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].label).toBe('Podpis / piecz ą tka');
        expect(result.candidates[0].rect.x).toBeGreaterThan(370);
    });

    it.each([
        'Brzeg, 08.09.2026 r. Podpis osoby upoważnionej: ........',
        'miejscowość, data podpis/-y osoby/osób wskazanych w dokumencie',
        'Miejscowo ść, data Podpis osoby upoważnionej',
    ])('accepts a label after the date: %s', async (text) => {
        const result = await find({ lines: [{ x: 30, y: 400, text }] });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].label.toLowerCase()).toMatch(/^podpis/u);
    });

    it.each([
        'Dokument należy podpisać kwalifikowanym podpisem elektronicznym',
        'kwalifikowany podpis elektroniczny lub podpis zaufany lub podpis osobisty',
        'Ja, niżej podpisany Marek Gazda, jako przedstawiciel Wykonawcy',
        'pełnomocnictwo do podpisania oferty',
        'Oświadczam, że podpisuję niniejszą ofertę, jako osoba…',
        '7. Podpis',
        'Panel podpisu elektronicznego:',
        'Wykonawca złożył ofertę.',
        'Dokument zawiera podpis osoby upoważnionej.',
        'Wymagany ELEKTRONICZNY PODPIS WYKONAWCY',
    ])('rejects prose or a section heading: %s', async (text) => {
        expect((await find({ lines: [{ x: 30, y: 400, text }] })).candidates).toEqual([]);
    });

    it('ignores dotted, ellipsis and underscore signature lines', async () => {
        const result = await find({ lines: [LABEL, { x: 200, y: 425, text: '... ……… ____   ...' }] });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].rect.y).toBeGreaterThan(400);
    });

    it('ignores thin table rules', async () => {
        const doc = await PDFDocument.load(await makeFixture({ lines: [LABEL] }));
        const page = doc.getPage(0);
        for (const y of [415, 450]) page.drawLine({ start: { x: 180, y }, end: { x: 560, y }, thickness: 0.5, color: rgb(0, 0, 0) });
        for (const x of [180, 560]) page.drawLine({ start: { x, y: 350 }, end: { x, y: 470 }, thickness: 0.5, color: rgb(0, 0, 0) });
        const result = await findContractorSignaturePlaces(Buffer.from(await doc.save()));
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].rect.y).toBeGreaterThan(400);
    });

    it('does not ignore a thick line, an image or a filled background', async () => {
        const doc = await PDFDocument.load(await makeFixture({ lines: [LABEL], image: true }));
        doc.getPage(0).drawLine({ start: { x: 180, y: 440 }, end: { x: 560, y: 440 }, thickness: 2, color: rgb(0, 0, 0) });
        expect((await findContractorSignaturePlaces(Buffer.from(await doc.save()))).candidates).toEqual([]);
        expect((await find({ lines: [LABEL], greyBackground: true })).candidates).toEqual([]);
    });

    it('centres on the label without a trailing dotted signature line', async () => {
        const a = await find({ lines: [{ x: 200, y: 400, text: 'Podpis osoby upoważnionej:' }] });
        const b = await find({ lines: [
            { x: 200, y: 400, text: 'Podpis osoby upoważnionej:' },
            { x: 345, y: 400, text: '.................' },
        ] });
        expect(b.candidates[0].rect.x).toBeCloseTo(a.candidates[0].rect.x);
        expect(b.candidates[0].label).toBe(a.candidates[0].label);
    });

    it('tries the opposite side if the preferred side is occupied', async () => {
        const result = await find({ lines: [LABEL, { x: 220, y: 430, text: 'Occupied above' }] });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].rect.y + result.candidates[0].rect.height).toBeLessThan(400);
    });

    it('rejects a label with both sides occupied', async () => {
        const result = await find({ lines: [LABEL,
            { x: 220, y: 430, text: 'Occupied above' },
            { x: 220, y: 380, text: 'Occupied below' },
        ] });
        expect(result.candidates).toEqual([]);
    });

    it.each(['rotated', 'crop', 'offset'] as const)('marks a %s page unplaceable', async (kind) => {
        const doc = await PDFDocument.load(await makeFixture({ lines: [LABEL] }));
        const page = doc.getPage(0);
        if (kind === 'rotated') page.setRotation(degrees(90));
        if (kind === 'crop') page.setCropBox(20, 20, 550, 800);
        if (kind === 'offset') page.setMediaBox(10, 10, W, H);
        const result = await findContractorSignaturePlaces(Buffer.from(await doc.save()));
        expect(result.pages).toEqual([{ width: W, height: H, placeable: false }]);
        expect(result.candidates).toEqual([]);
    });

    it('returns two places in page and top-to-bottom reading order', async () => {
        const result = await find({ lines: [{ ...LABEL, y: 200 }, { ...LABEL, y: 600 }], twoPages: true });
        expect(result.pages).toHaveLength(2);
        expect(result.candidates).toHaveLength(2);
        expect(result.candidates.map((c) => c.page)).toEqual([1, 1]);
        expect(result.candidates[0].rect.y).toBeGreaterThan(result.candidates[1].rect.y);
    });

    it('deduplicates overlapping stamps, retaining the first label', async () => {
        const result = await find({ lines: [
            { x: 200, y: 400, text: 'ELEKTRONICZNY PODPIS' },
            { x: 350, y: 400, text: 'podpis Wykonawcy' },
        ] });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].label).toBe('ELEKTRONICZNY PODPIS');
    });

    it('keeps the whole stamp within the page and horizontal margins', async () => {
        const result = await find({ lines: [
            { x: 1, y: 800, text: 'podpis Wykonawcy' },
            { x: 490, y: 2, text: 'podpis Wykonawcy' },
        ] });
        expect(result.candidates).toHaveLength(2);
        for (const { rect } of result.candidates) {
            expect(rect.x).toBeGreaterThanOrEqual(W * 0.04);
            expect(rect.x + rect.width).toBeLessThanOrEqual(W * 0.96);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.y + rect.height).toBeLessThanOrEqual(H);
        }
    });

    it('maps malformed PDFs to INVALID_PDF', async () => {
        await expect(findContractorSignaturePlaces(Buffer.from('bad PDF'))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    });

    it('rejects PDFs with no pages', async () => {
        const doc = await PDFDocument.create();
        await expect(findContractorSignaturePlaces(Buffer.from(await doc.save({ addDefaultPage: false })))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    });

    it('maps encrypted PDFs to ENCRYPTED_PDF', async () => {
        const doc = await PDFDocument.load(await makeFixture({ lines: [] }));
        doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard' }));
        await expect(findContractorSignaturePlaces(Buffer.from(await doc.save()))).rejects.toMatchObject({ code: 'ENCRYPTED_PDF' });
    });
});
