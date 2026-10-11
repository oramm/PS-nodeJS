import { SigningJobError } from '../SigningJobError';
import { makeFixture } from '../../__tests__/testPdfs';
import {
    Kit,
    KitIdentity,
    MIME,
    OFFER_CASE_FOLDER_ID_0001,
    OFFER_FILE_IDS,
    OFFER_FILES_FOLDER_ID_001,
    OFFER_ID,
    OUR_OFFER_ID,
    PERSON_ID,
    b64,
    makeIdentity,
    makeKit,
    makePlainPdf,
    softwareCardSign,
    tokenOf,
} from './jobsTestKit';

/**
 * Decyzje wlasciciela 2026-10-10 (po obejrzeniu kroku 2): podpisujemy takze pliki ofert wlasnych,
 * a gdy w folderze sprawy "Przygotowanie oferty" nie ma podfolderu "Oferta", pliki bierzemy wprost
 * z folderu sprawy i tam trafiaja podpisane kopie.
 */
let identity: KitIdentity;
let kit: Kit;
const OWN_CASE_FOLDER = 'OWN_CASE_FOLDER_ID_0001';
const OWN_DOC = 'OWN_OFFER_DOC_ID_0001';
const OWN_PDF = 'OWN_OFFER_PDF_ID_0001';

beforeAll(async () => {
    identity = await makeIdentity({ commonName: 'Żaneta Gęślarz-Łoś' });
});

beforeEach(async () => {
    kit = await makeKit(identity.allowlist);
    // Oferta wlasna: PS nie tworzy podfolderu "Oferta"; dokument oferty lezy wprost w folderze sprawy.
    kit.repo.offers.set(OUR_OFFER_ID, {
        id: OUR_OFFER_ID,
        alias: 'OWN test',
        isOur: true,
        makeOfferCaseFolderIds: [OWN_CASE_FOLDER],
    });
    const pdf = await makePlainPdf();
    kit.drive.add({ id: OWN_CASE_FOLDER, name: '01 Przygotowanie oferty', mimeType: MIME.folder });
    kit.drive.add({ id: OWN_DOC, name: 'Oferta SW test 2026-10-05', mimeType: MIME.doc, parents: [OWN_CASE_FOLDER] }, pdf);
    kit.drive.add({ id: OWN_PDF, name: 'Zaproszenie.pdf', mimeType: MIME.pdf, size: 1000, parents: [OWN_CASE_FOLDER] }, pdf);
    kit.drive.add({ id: 'OWN_OLD_SIGNED_00001', name: 'Zaproszenie-sig.pdf', mimeType: MIME.pdf, size: 1000, parents: [OWN_CASE_FOLDER] }, pdf);
});

async function rejected(promise: Promise<unknown>): Promise<SigningJobError> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(SigningJobError);
        return error as SigningJobError;
    }
    throw new Error('oczekiwano odmowy');
}

async function signAll(offerId: number, gdFileIds: string[]) {
    const created = await kit.controller.createJob(PERSON_ID, {
        offerId,
        files: gdFileIds.map((gdFileId) => ({ kind: 'DRIVE_FILE', gdFileId, withGraphic: false })),
    });
    const token = tokenOf(created.protocolUrl);
    const prepared = await kit.controller.submitCertificate(token, { chain: identity.chainDer.map(b64) });
    const signatures = {
        signatures: prepared.files.map((f, index) => ({
            index,
            signature: b64(softwareCardSign(Buffer.from(f.hashToSign, 'hex'), identity.privateKey)),
        })),
    };
    return { created, token, prepared, signatures };
}

const uploads = () => kit.drive.writes.filter((w) => w.op === 'upload');

describe('oferta wlasna', () => {
    it('rozpoznaje zatwierdzenie tylko w dokumencie wskazanym zapisanym ID, bez zmiany grafiki zalacznikow', async () => {
        kit.repo.offers.get(OUR_OFFER_ID)!.gdDocumentId = OWN_DOC;
        const pdf = await makeFixture({ lines: [{ x: 320, y: 200, text: 'Ofertę zatwierdził: Marek Gazda' }] });
        kit.drive.add({ id: OWN_DOC, name: 'Dowolna nowa nazwa', mimeType: MIME.doc, parents: [OWN_CASE_FOLDER] }, pdf);
        kit.drive.add({ id: OWN_PDF, name: 'Oferta SW test 2026-10-05.pdf', mimeType: MIME.pdf, parents: [OWN_CASE_FOLDER] }, pdf);
        const found = await kit.controller.locateOfferGraphicPlace(OUR_OFFER_ID, OWN_DOC);
        expect(found.candidates).toHaveLength(1);
        expect(found.candidates[0].label).toBe('Ofertę zatwierdził: Marek Gazda');
        expect((await kit.controller.locateOfferGraphicPlace(OUR_OFFER_ID, OWN_PDF)).candidates).toEqual([]);
        const listed = await kit.controller.listOfferSignableFiles(OUR_OFFER_ID);
        expect(listed.files.every((file) => !file.withGraphic && !file.graphicLocked)).toBe(true);
        const created = await kit.controller.createJob(PERSON_ID, {
            offerId: OUR_OFFER_ID,
            files: [{ kind: 'DRIVE_FILE', gdFileId: OWN_DOC, withGraphic: true, placement: found.candidates[0] }],
        });
        const prepared = await kit.controller.submitCertificate(tokenOf(created.protocolUrl), { chain: identity.chainDer.map(b64) });
        expect(prepared.files).toHaveLength(1);
        expect(uploads()).toEqual([]);
    });

    it('glowny dokument z wylaczona grafika przygotowuje sie bez bloku zatwierdzenia', async () => {
        kit.repo.offers.get(OUR_OFFER_ID)!.gdDocumentId = OWN_DOC;
        const job = await signAll(OUR_OFFER_ID, [OWN_DOC]);
        expect(job.prepared.files).toHaveLength(1);
        expect(uploads()).toEqual([]);
    });

    it('oferta zewnetrzna nie dostaje reguly zatwierdzenia nawet z zapisanym ID dokumentu', async () => {
        kit.repo.offers.get(OUR_OFFER_ID)!.gdDocumentId = OWN_DOC;
        kit.repo.offers.get(OUR_OFFER_ID)!.isOur = false;
        kit.drive.add({ id: OWN_DOC, name: 'Oferta', mimeType: MIME.doc, parents: [OWN_CASE_FOLDER] },
            await makeFixture({ lines: [{ x: 320, y: 200, text: 'Ofertę zatwierdził: Marek Gazda' }] }));
        expect((await kit.controller.locateOfferGraphicPlace(OUR_OFFER_ID, OWN_DOC)).candidates).toEqual([]);
    });

    it('lista: pliki wprost z folderu sprawy (dokument oferty i PDF), z cudzym podpisem; folder opisany jako CASE', async () => {
        const result = await kit.controller.listOfferSignableFiles(OUR_OFFER_ID);
        expect(result.folder).toBe('CASE');
        expect(result.files.map((f) => f.name)).toEqual(['Oferta SW test 2026-10-05', 'Zaproszenie.pdf', 'Zaproszenie-sig.pdf']);
        expect(result.files.every((f) => f.kind === 'DRIVE_FILE' && !f.withGraphic && !f.graphicLocked)).toBe(true);
    });

    it('podpis: podpisane kopie trafiaja do folderu sprawy, rejestr wskazuje oferte', async () => {
        const job = await signAll(OUR_OFFER_ID, [OWN_DOC, OWN_PDF]);
        expect(await kit.controller.submitSignatures(job.token, job.signatures)).toEqual({ status: 'done' });
        expect(uploads().map((w) => [w.name, w.parent])).toEqual([
            ['Oferta SW test 2026-10-05_pdp.pdf', OWN_CASE_FOLDER],
            ['Zaproszenie_pdp.pdf', OWN_CASE_FOLDER],
        ]);
        const { signatures } = await kit.controller.listOfferSignatures(OUR_OFFER_ID);
        expect(signatures).toHaveLength(2);
        expect(signatures.every((s) => s.sourceType === 'OFFER_DOCUMENT')).toBe(true);
    });

    it('oferta bez folderu sprawy nadal dostaje czytelna odmowe', async () => {
        kit.repo.offers.get(OUR_OFFER_ID)!.makeOfferCaseFolderIds = [];
        const error = await rejected(kit.controller.listOfferSignableFiles(OUR_OFFER_ID));
        expect(error.status).toBe(409);
        expect(error.message).toContain('Przygotowanie oferty');
    });
});

describe('oferta zewnetrzna bez podfolderu "Oferta"', () => {
    const DIRECT = 'DIRECT_OFFER_PDF_ID_001';

    beforeEach(async () => {
        kit.drive.files.get(OFFER_FILES_FOLDER_ID_001)!.trashed = true;
        kit.drive.add(
            { id: DIRECT, name: 'Formularz w folderze sprawy.pdf', mimeType: MIME.pdf, size: 1000, parents: [OFFER_CASE_FOLDER_ID_0001] },
            await makePlainPdf()
        );
    });

    it('lista: pliki wprost z folderu sprawy; podfoldery (SWZ) pominiete; folder opisany jako CASE', async () => {
        const result = await kit.controller.listOfferSignableFiles(OFFER_ID);
        expect(result.folder).toBe('CASE');
        expect(result.files.map((f) => f.name)).toEqual(['Formularz w folderze sprawy.pdf']);
    });

    it('podpis: kopia trafia do folderu sprawy', async () => {
        const job = await signAll(OFFER_ID, [DIRECT]);
        await kit.controller.submitSignatures(job.token, job.signatures);
        expect(uploads().map((w) => w.parent)).toEqual([OFFER_CASE_FOLDER_ID_0001]);
    });

    it('podfolder "Oferta" utworzony w trakcie zlecenia: zapis nie trafia do niego, zlecenie failed', async () => {
        const job = await signAll(OFFER_ID, [DIRECT]);
        kit.drive.add({ id: 'OFFER_FILES_FOLDER_NEW_2', name: 'Oferta', mimeType: MIME.folder, parents: [OFFER_CASE_FOLDER_ID_0001] });
        const error = await rejected(kit.controller.submitSignatures(job.token, job.signatures));
        expect(error.message).toMatch(/nie ma już w folderze oferty/);
        expect(uploads()).toEqual([]);
    });
});

describe('oferta zewnetrzna z podfolderem "Oferta" (bez zmian)', () => {
    it('lista z podfolderu; folder opisany jako OFERTA; pliki z folderu sprawy nie sa mieszane', async () => {
        kit.drive.add(
            { id: 'DIRECT_OFFER_PDF_ID_002', name: 'Luzem w folderze sprawy.pdf', mimeType: MIME.pdf, size: 1000, parents: [OFFER_CASE_FOLDER_ID_0001] },
            await makePlainPdf()
        );
        const result = await kit.controller.listOfferSignableFiles(OFFER_ID);
        expect(result.folder).toBe('OFERTA');
        expect(result.files.map((f) => f.gdFileId)).toEqual([OFFER_FILE_IDS.formularz, OFFER_FILE_IDS.zalacznik2, OFFER_FILE_IDS.formularzSig]);
    });
});
