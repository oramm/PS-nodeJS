import { PDFDocument } from 'pdf-lib';
import { findContractorSignaturePlaces } from '../ContractorSignaturePlace';
import { extractPageContent } from '../PdfPageAnalyzer';
import { SIGNATURE_HEIGHT_REL, SIGNATURE_WIDTH_REL } from '../SignaturePlacement';
import { makeFixture } from './testPdfs';

const W = 595;
const H = 842;

describe('contract party headings', () => {
    it.each([
        ['ZAMAWIAJĄCY', 'WYKONAWCA'],
        ['ZAMAWIAJĄCY:', 'WYKONAWCA:'],
        ['Zamawiający', 'Wykonawca'],
        ['ZAMAWIAJĄCY:', 'INŻYNIER KONTRAKTU /WYKONAWCA :'],
    ])('places one stamp below the right heading: %s / %s', async (employer, contractor) => {
        const pdf = await makeFixture({ lines: [
            { x: 50, y: 400, text: employer },
            { x: 330, y: 400, text: contractor },
        ] });
        const result = await findContractorSignaturePlaces(pdf, { partyHeadings: true });
        expect(result.candidates).toHaveLength(1);
        const { rect, label } = result.candidates[0];
        const { chunks } = await extractPageContent(pdf, 1, W, H);
        const heading = chunks.find((chunk) => chunk.text.includes('WYKONAWCA') || chunk.text.includes('Wykonawca'))!;
        expect(label).toBe(contractor);
        expect(rect.x + rect.width / 2).toBeCloseTo((heading.box.left + heading.box.right) / 2);
        expect(rect.x).toBeGreaterThan(250);
        expect(rect.y + rect.height).toBeCloseTo(heading.box.bottom - 4);
        expect(rect.width).toBeCloseTo(W * SIGNATURE_WIDTH_REL);
        expect(rect.height).toBeCloseTo(H * SIGNATURE_HEIGHT_REL);
        expect((await findContractorSignaturePlaces(pdf)).candidates).toEqual([]);
        expect((await findContractorSignaturePlaces(pdf, { partyHeadings: false })).candidates).toEqual([]);
    });

    it('recognises both headings printed in one text operation', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 60, y: 400, text: 'ZAMAWIAJĄCY:                            WYKONAWCA:' },
        ] });
        const result = await findContractorSignaturePlaces(pdf, { partyHeadings: true });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].label).toBe('WYKONAWCA:');
        const { chunks } = await extractPageContent(pdf, 1, W, H);
        const heading = chunks.find((chunk) => chunk.text === 'WYKONAWCA:')!;
        expect(result.candidates[0].rect.x + result.candidates[0].rect.width / 2)
            .toBeCloseTo((heading.box.left + heading.box.right) / 2);
        expect(result.candidates[0].rect.x).toBeGreaterThan(130);
        expect(result.candidates[0].rect.y + result.candidates[0].rect.height).toBeLessThan(400);
        expect((await findContractorSignaturePlaces(pdf)).candidates).toEqual([]);
    });

    it('ignores dotted and underscore lines under the heading', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 60, y: 300, text: 'ZAMAWIAJĄCY:' },
            { x: 330, y: 300, text: 'WYKONAWCA:' },
            { x: 330, y: 275, text: '.............. ______' },
        ] });
        const result = await findContractorSignaturePlaces(pdf, { partyHeadings: true });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].label).toBe('WYKONAWCA:');
        expect(result.candidates[0].rect.y + result.candidates[0].rect.height).toBeLessThan(300);
        expect((await findContractorSignaturePlaces(pdf)).candidates).toEqual([]);
    });

    it.each([
        'Zamawiający zleca, a Wykonawca przyjmuje',
        'WYKONAWCA:',
        'ZAMAWIAJĄCY WYKONAWCA zobowiązuje się',
    ])('rejects prose or an unpaired heading: %s', async (text) => {
        const pdf = await makeFixture({ lines: [{ x: 60, y: 400, text }] });
        expect((await findContractorSignaturePlaces(pdf, { partyHeadings: true })).candidates).toEqual([]);
        expect((await findContractorSignaturePlaces(pdf)).candidates).toEqual([]);
    });

    it.each([false, true])('tries above when below collides, rejects both sides if occupied: %s', async (both) => {
        const pdf = await makeFixture({ lines: [
            { x: 50, y: 400, text: 'ZAMAWIAJĄCY' },
            { x: 330, y: 400, text: 'WYKONAWCA' },
            { x: 330, y: 380, text: 'Zajete ponizej' },
            ...(both ? [{ x: 330, y: 430, text: 'Zajete powyzej' }] : []),
        ] });
        const result = await findContractorSignaturePlaces(pdf, { partyHeadings: true });
        if (both) expect(result.candidates).toEqual([]);
        else {
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].rect.y).toBeGreaterThan(400);
        }
    });

    it('does not pair headings from different pages', async () => {
        const doc = await PDFDocument.load(await makeFixture({ lines: [{ x: 60, y: 400, text: 'ZAMAWIAJĄCY:' }] }));
        const second = await PDFDocument.load(await makeFixture({ lines: [{ x: 330, y: 400, text: 'WYKONAWCA:' }] }));
        doc.addPage((await doc.copyPages(second, [0]))[0]);
        expect((await findContractorSignaturePlaces(Buffer.from(await doc.save()), { partyHeadings: true })).candidates).toEqual([]);
    });

    it('deduplicates party stamps against overlapping signature anchors', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 50, y: 400, text: 'ZAMAWIAJĄCY' },
            { x: 330, y: 400, text: 'WYKONAWCA' },
            { x: 330, y: 325, text: 'podpis Wykonawcy' },
        ] });
        expect((await findContractorSignaturePlaces(pdf, { partyHeadings: true })).candidates).toHaveLength(1);
    });

    it('tries above when below does not fit the page' , async () => {
        const pdf = await makeFixture({ lines: [
            { x: 50, y: 20, text: 'ZAMAWIAJĄCY' },
            { x: 330, y: 20, text: 'WYKONAWCA' },
        ] });
        const result = await findContractorSignaturePlaces(pdf, { partyHeadings: true });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].rect.y).toBeGreaterThan(20);
    });

    // Po przegladzie Sola: naglowki stron w osobnych wierszach to czesto opis stron umowy, nie blok podpisow.
    it('does not pair headings printed in separate rows (party description, not a signature block)', async () => {
        const pdf = await makeFixture({ lines: [
            { x: 60, y: 700, text: 'ZAMAWIAJĄCY:' },
            { x: 60, y: 680, text: 'Gmina Przykladowa, ul. Dluga 1' },
            { x: 60, y: 600, text: 'WYKONAWCA:' },
            { x: 60, y: 580, text: 'ENVI Konsulting' },
        ] });
        expect((await findContractorSignaturePlaces(pdf, { partyHeadings: true })).candidates).toEqual([]);
    });

    it('in a contract only the party heading counts: a generic signature caption may belong to the other party', async () => {
        const pdf = await makeFixture({ lines: [{ x: 60, y: 400, text: 'podpis osoby upoważnionej' }] });
        expect((await findContractorSignaturePlaces(pdf)).candidates).toHaveLength(1);
        expect((await findContractorSignaturePlaces(pdf, { partyHeadings: true })).candidates).toEqual([]);
    });
});
