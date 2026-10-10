import { PDFDocument } from 'pdf-lib';
import { renderPdfPage } from '../../PdfPageRenderer';
import { SigningJobError } from '../SigningJobError';
import {
    Kit,
    KitIdentity,
    LETTER_FOLDER_ID,
    LETTER_ID,
    MIME,
    OFFER_CASE_FOLDER_ID_0001,
    OFFER_FILE_IDS,
    OFFER_FILES_FOLDER_ID_001,
    OFFER_ID,
    PERSON_ID,
    b64,
    makeIdentity,
    makeKit,
    softwareCardSign,
    tokenOf,
} from './jobsTestKit';

/**
 * Testy regresji do ustalen niezaleznego przegladu (Sol, 2026-10-10) przed wydaniem podpisu ofert.
 * Kazdy byl czerwony na kodzie sprzed poprawki.
 */
let identity: KitIdentity;
let kit: Kit;

beforeAll(async () => {
    identity = await makeIdentity({ commonName: 'Żaneta Gęślarz-Łoś' });
});

beforeEach(async () => {
    kit = await makeKit(identity.allowlist);
});

const FORM = OFFER_FILE_IDS.formularz;
const ATT2 = OFFER_FILE_IDS.zalacznik2;

async function rejected(promise: Promise<unknown>): Promise<SigningJobError> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(SigningJobError);
        return error as SigningJobError;
    }
    throw new Error('oczekiwano odmowy');
}

async function prepareOfferJob(files: unknown[]) {
    const created = await kit.controller.createJob(PERSON_ID, { offerId: OFFER_ID, files });
    const token = tokenOf(created.protocolUrl);
    const prepared = await kit.controller.submitCertificate(token, { chain: identity.chainDer.map(b64) });
    return { ...created, token, prepared };
}

const cardSignatures = (prepared: { files: Array<{ hashToSign: string }> }) => ({
    signatures: prepared.files.map((f, index) => ({
        index,
        signature: b64(softwareCardSign(Buffer.from(f.hashToSign, 'hex'), identity.privateKey)),
    })),
});

const plain = (...ids: string[]) => ids.map((gdFileId) => ({ kind: 'DRIVE_FILE', gdFileId, withGraphic: false }));
const uploads = () => kit.drive.writes.filter((w) => w.op === 'upload');

describe('obraz strony: rozmiar jest ograniczony w obu wymiarach', () => {
    it('bardzo wysoka strona nie daje gigantycznego obrazu', async () => {
        const doc = await PDFDocument.create();
        doc.addPage([200, 14400]);
        const { widthPx, heightPx, png } = await renderPdfPage(Buffer.from(await doc.save()), 1);
        expect(heightPx).toBeLessThanOrEqual(2400);
        expect(widthPx * heightPx).toBeLessThanOrEqual(4_000_000);
        expect(widthPx).toBeGreaterThanOrEqual(1);
        expect(png.readUInt32BE(16)).toBe(widthPx);
        expect(png.readUInt32BE(20)).toBe(heightPx);
    });
});

describe('folder "Oferta" podmieniony w trakcie zlecenia', () => {
    it('zapis nie trafia do innego folderu o tej samej nazwie: zlecenie failed, zero zapisow', async () => {
        const job = await prepareOfferJob(plain(FORM));
        // Ktos zmienia nazwe pierwotnego folderu i tworzy nowy "Oferta" (plik zrodlowy zostaje w starym).
        kit.drive.files.get(OFFER_FILES_FOLDER_ID_001)!.name = 'Oferta - stara';
        kit.drive.add({
            id: 'OFFER_FILES_FOLDER_NEW_1',
            name: 'Oferta',
            mimeType: MIME.folder,
            parents: [OFFER_CASE_FOLDER_ID_0001],
        });
        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));
        expect(error.message).toMatch(/nie ma już w folderze oferty/);
        expect(uploads()).toEqual([]);
        expect((await kit.controller.getJobStatus(job.jobId, PERSON_ID)).status).toBe('failed');
        expect(await kit.controller.listOfferSignatures(OFFER_ID)).toEqual({ offerId: OFFER_ID, signatures: [] });
    });
});

describe('jawne miejsce grafiki poza strona', () => {
    it.each([
        ['daleko poza strona', { x: 14000, y: 14000, width: 160, height: 50 }],
        ['wystaje za prawa krawedz', { x: 500, y: 100, width: 160, height: 50 }],
        ['wystaje nad gorna krawedz', { x: 100, y: 820, width: 160, height: 50 }],
    ])('%s: przygotowanie odmawia, zlecenie failed, nic nie jest gotowe do podpisu', async (_label, rect) => {
        const created = await kit.controller.createJob(PERSON_ID, {
            offerId: OFFER_ID,
            files: [{ kind: 'DRIVE_FILE', gdFileId: FORM, withGraphic: true, placement: { page: 1, rect } }],
        });
        const error = await rejected(
            kit.controller.submitCertificate(tokenOf(created.protocolUrl), { chain: identity.chainDer.map(b64) })
        );
        expect(error.code).toBe('PREPARE_FAILED');
        expect(error.message).toMatch(/nie da się ustawić grafiki podpisu/);
        const status = await kit.controller.getJobStatus(created.jobId, PERSON_ID);
        expect(status.status).toBe('failed');
        expect(kit.drive.writes).toEqual([]);
    });
});

describe('pisma: rozpoznawanie podpisanych kopii bez zmian', () => {
    it('zalaczniki pisma z "_sig_" w srodku nazwy i z "-sig" na koncu sa nadal na liscie do podpisu', async () => {
        kit.drive.add(
            { id: 'ATT_SIG_MIDDLE_0001', name: 'formularz_sig_wykonawcy.pdf', mimeType: MIME.pdf, size: 1000, parents: [LETTER_FOLDER_ID] }
        );
        kit.drive.add(
            { id: 'ATT_SIG_HYPHEN_0001', name: 'Zalacznik-sig.pdf', mimeType: MIME.pdf, size: 1000, parents: [LETTER_FOLDER_ID] }
        );
        const names = (await kit.controller.listSignableFiles(LETTER_ID)).files.map((f) => f.name);
        expect(names).toContain('formularz_sig_wykonawcy.pdf');
        expect(names).toContain('Zalacznik-sig.pdf');
        // dotychczasowa regula pism zostaje: "_podpisany" na koncu jest ukryty
        expect(names).not.toContain('Umowa_podpisany.pdf');
    });

    it('w folderze oferty "_sig_" w srodku nazwy to zwykly plik, a "-sig" na koncu to podpisana kopia', async () => {
        kit.drive.add(
            { id: 'OFFER_SIG_MIDDLE_001', name: 'formularz_sig_wykonawcy.pdf', mimeType: MIME.pdf, size: 1000, parents: [OFFER_FILES_FOLDER_ID_001] }
        );
        const names = (await kit.controller.listOfferSignableFiles(OFFER_ID)).files.map((f) => f.name);
        expect(names).toContain('formularz_sig_wykonawcy.pdf');
        expect(names).not.toContain('Formularz oferty-sig.pdf');
    });
});

describe('nieudane sprzatanie po nieudanym zapisie', () => {
    it('komunikat nie twierdzi, ze nic nie zapisano, i wymienia plik, ktory zostal na Dysku', async () => {
        const job = await prepareOfferJob(plain(FORM, ATT2));
        kit.drive.failUploadAt = 2;
        kit.drive.trashFile = async () => {
            throw new Error('kosz niedostepny');
        };
        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));
        expect(error.message).not.toMatch(/Nic nie zostało zapisane/);
        expect(error.message).toContain('Formularz oferty_pdp.pdf');
        const status = await kit.controller.getJobStatus(job.jobId, PERSON_ID);
        expect(status.status).toBe('failed');
        expect(status.failureMessage).toContain('Formularz oferty_pdp.pdf');
    });

    it('gdy sprzatanie sie udalo, komunikat nadal mowi, ze nic nie zapisano', async () => {
        const job = await prepareOfferJob(plain(FORM, ATT2));
        kit.drive.failUploadAt = 2;
        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));
        expect(error.message).toMatch(/Nic nie zostało zapisane/);
    });
});
