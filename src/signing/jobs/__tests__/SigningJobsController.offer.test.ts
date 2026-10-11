import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { finalize, prepare, validate, SigningError } from '../..';
import * as signing from '../../PdfSigning';
import { SigningJobError } from '../SigningJobError';
import {
    Kit,
    KitIdentity,
    LETTER_ID,
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
const VALID_PLACEMENT = { page: 1, rect: { x: 300, y: 100, width: 160, height: 50 } };

/** Wybor plikow z folderu "Oferta" do zlecenia, bez grafiki. */
const plain = (...gdFileIds: string[]) =>
    gdFileIds.map((gdFileId) => ({ kind: 'DRIVE_FILE', gdFileId, withGraphic: false }));

async function startOfferJob(files: unknown[] = plain(FORM), personId = PERSON_ID) {
    const created = await kit.controller.createJob(personId, { offerId: OFFER_ID, files });
    return { ...created, token: tokenOf(created.protocolUrl) };
}

const certBody = (id: KitIdentity = identity) => ({ chain: id.chainDer.map(b64) });

async function prepareOfferJob(files: unknown[] = plain(FORM), id: KitIdentity = identity) {
    const job = await startOfferJob(files);
    const prepared = await kit.controller.submitCertificate(job.token, certBody(id));
    return { ...job, prepared };
}

/** Karta: dostaje tylko skrot (hex) i zwraca podpis RSA. */
function cardSignatures(prepared: { files: Array<{ hashToSign: string }> }, id: KitIdentity = identity) {
    return {
        signatures: prepared.files.map((f, index) => ({
            index,
            signature: b64(softwareCardSign(Buffer.from(f.hashToSign, 'hex'), id.privateKey)),
        })),
    };
}

async function rejected(promise: Promise<unknown>): Promise<SigningJobError> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(SigningJobError);
        return error as SigningJobError;
    }
    throw new Error('oczekiwano odmowy');
}

const noWrites = () => expect(kit.drive.writes).toEqual([]);

/** PDF podpisany "gdzie indziej" przez dowolna tozsamosc (pelna sciezka biblioteki). */
async function signElsewhere(id: KitIdentity, pdf: Buffer): Promise<Buffer> {
    const prepared = await prepare(pdf, id.chainDer, 'lastPageCorner');
    return finalize(
        prepared.preparedPdf,
        prepared.signedAttrsDer,
        softwareCardSign(prepared.hashToSign, id.privateKey),
        id.chainDer
    );
}

/** Prostokaty widgetow podpisu (FT /Sig) na stronie 1 - odczyt pdf-lib, bez logiki produkcyjnej. */
async function signatureWidgetRects(pdf: Buffer): Promise<number[][]> {
    const doc = await PDFDocument.load(pdf);
    const annots = doc.getPage(0).node.Annots();
    const rects: number[][] = [];
    for (let i = 0; annots && i < annots.size(); i++) {
        const widget = doc.context.lookup(annots.get(i), PDFDict) as PDFDict | undefined;
        if (!widget || widget.get(PDFName.of('FT'))?.toString() !== '/Sig') continue;
        const rect = widget.lookup(PDFName.of('Rect'), PDFArray) as PDFArray;
        rects.push(rect.asArray().map((n) => (n as PDFNumber).asNumber()));
    }
    return rects;
}

describe('lista plikow oferty', () => {
    it('pokazuje PDF-y z folderu Oferta wraz z cudzym podpisem; nasze kopie, docx i podfolder sa poza lista', async () => {
        const result = await kit.controller.listOfferSignableFiles(OFFER_ID);

        expect(result).toMatchObject({ offerId: OFFER_ID, offerAlias: 'OS test' });
        expect(result.files.map((f) => [f.kind, f.gdFileId, f.name, f.withGraphic, f.graphicLocked])).toEqual([
            ['DRIVE_FILE', FORM, 'Formularz oferty.pdf', false, false],
            ['DRIVE_FILE', ATT2, 'Zalacznik 2.pdf', false, false],
            ['DRIVE_FILE', OFFER_FILE_IDS.formularzSig, 'Formularz oferty-sig.pdf', false, false],
        ]);
        expect(result.notSignable.map((f) => f.name)).toEqual(['Wykaz.docx']);
        expect(result.notSignable[0].reason).toMatch(/PDF oraz Dokumenty i Arkusze Google/);
        const listed = [...result.files, ...result.notSignable].map((f) => f.name);
        for (const hidden of ['Stary_pdp.pdf', 'MG', 'SWZ.pdf']) {
            expect(listed).not.toContain(hidden);
        }
        noWrites();
    });
});

describe('zrodlo oferty: odmowy przed czymkolwiek innym', () => {
    it('oferta wlasna bez folderu sprawy: 409 (oferty wlasne sa podpisywane od decyzji z 2026-10-10, ale folder musi byc)', async () => {
        const error = await rejected(kit.controller.listOfferSignableFiles(OUR_OFFER_ID));

        expect(error.status).toBe(409);
        expect(error.message).toContain('Przygotowanie oferty');
        noWrites();
    });

    it('oferta wlasna bez folderu sprawy nie zaklada zlecenia', async () => {
        const error = await rejected(
            kit.controller.createJob(PERSON_ID, { offerId: OUR_OFFER_ID, files: plain(FORM) })
        );

        expect(error.status).toBe(409);
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('nieistniejaca oferta: 404', async () => {
        const error = await rejected(kit.controller.listOfferSignableFiles(987654));

        expect(error.status).toBe(404);
        noWrites();
    });

    it('brak podfolderu Oferta: lista bierze pliki z folderu sprawy, a plik z dawnego podfolderu nie jest wybieralny', async () => {
        kit.drive.files.get(OFFER_FILES_FOLDER_ID_001)!.trashed = true;

        const list = await kit.controller.listOfferSignableFiles(OFFER_ID);
        const job = await rejected(kit.controller.createJob(PERSON_ID, { offerId: OFFER_ID, files: plain(FORM) }));

        expect(list.folder).toBe('CASE');
        expect(list.files).toEqual([]);
        expect(job.status).toBe(409);
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('dwa podfoldery Oferta w folderze sprawy: 409', async () => {
        kit.drive.add({
            id: 'OFFER_FILES_FOLDER_ID_002',
            name: 'Oferta',
            mimeType: MIME.folder,
            parents: [OFFER_CASE_FOLDER_ID_0001],
        });

        const error = await rejected(kit.controller.listOfferSignableFiles(OFFER_ID));

        expect(error.status).toBe(409);
        expect(error.message).toContain('więcej niż jeden podfolder „Oferta”');
        noWrites();
    });

    it('oferta bez folderu sprawy "Przygotowanie oferty": 409', async () => {
        kit.repo.offers.get(OFFER_ID)!.makeOfferCaseFolderIds = [];

        const error = await rejected(kit.controller.listOfferSignableFiles(OFFER_ID));

        expect(error.status).toBe(409);
        expect(error.message).toContain('nie ma na Dysku Google folderu sprawy');
        noWrites();
    });

    it('dwa foldery sprawy "Przygotowanie oferty": 409', async () => {
        kit.repo.offers.get(OFFER_ID)!.makeOfferCaseFolderIds = [OFFER_CASE_FOLDER_ID_0001, 'OFFER_CASE_FOLDER_ID_0002'];

        const error = await rejected(kit.controller.listOfferSignableFiles(OFFER_ID));

        expect(error.status).toBe(409);
        expect(error.message).toContain('więcej niż jedną sprawę');
        noWrites();
    });

    it('podfolder o nazwie " oferta " (male litery, spacje) tez jest uznawany', async () => {
        kit.drive.files.get(OFFER_FILES_FOLDER_ID_001)!.name = ' oferta ';

        const result = await kit.controller.listOfferSignableFiles(OFFER_ID);

        expect(result.files.map((f) => f.name)).toEqual(['Formularz oferty.pdf', 'Zalacznik 2.pdf', 'Formularz oferty-sig.pdf']);
    });
});

describe('rola zakresowa nie dostaje ofert', () => {
    it('kazde wywolanie oferty z zakresem projektu daje 403, bez sprawdzania pisma i bez zapisow', async () => {
        const scope = { projectOurIds: ['2023.10'] };
        const calls: Array<() => Promise<unknown>> = [
            () => kit.controller.listOfferSignableFiles(OFFER_ID, scope),
            () => kit.controller.createJob(PERSON_ID, { offerId: OFFER_ID, files: plain(FORM) }, scope),
            () => kit.controller.uploadSignedToOffer(PERSON_ID, OFFER_ID, { buffer: Buffer.from('%PDF-1.4') }, scope),
            () => kit.controller.listOfferSignatures(OFFER_ID, scope),
            () => kit.controller.locateOfferGraphicPlace(OFFER_ID, FORM, scope),
            () => kit.controller.renderOfferFilePage(OFFER_ID, FORM, 1, scope),
        ];

        for (const call of calls) expect((await rejected(call())).status).toBe(403);
        expect(kit.scopeCalls).toEqual([]); // sprawdzenie zakresu pisma nie jest wolane dla oferty
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });
});

describe('createJob dla oferty: co mozna wskazac', () => {
    it('plik spoza folderu Oferta (zalacznik pisma, plik z SWZ) -> 409 "nie jest juz dostepny" (komunikat z diakrytykami)', async () => {
        for (const gdFileId of ['ATTACHMENT_PDF_001', OFFER_FILE_IDS.swzPdf]) {
            const error = await rejected(kit.controller.createJob(PERSON_ID, { offerId: OFFER_ID, files: plain(gdFileId) }));
            expect(error.status).toBe(409);
            expect(error.message).toContain('nie jest już dostępny');
        }
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('nasza podpisana kopia (_pdp) nie jest wybieralna do podpisu -> 409', async () => {
        for (const gdFileId of [OFFER_FILE_IDS.stary]) {
            const error = await rejected(kit.controller.createJob(PERSON_ID, { offerId: OFFER_ID, files: plain(gdFileId) }));
            expect(error.status).toBe(409);
        }
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('rodzaj LETTER_DOC dla oferty -> 409 (oferta nie ma dokumentu glownego)', async () => {
        const error = await rejected(
            kit.controller.createJob(PERSON_ID, { offerId: OFFER_ID, files: [{ kind: 'LETTER_DOC', withGraphic: false }] })
        );

        expect(error.status).toBe(409);
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('body z letterId i offerId naraz, bez obu, albo bez plikow -> 400', async () => {
        const files = plain(FORM);
        for (const body of [
            { letterId: LETTER_ID, offerId: OFFER_ID, files },
            { files },
            { offerId: OFFER_ID, files: [] },
        ]) {
            expect((await rejected(kit.controller.createJob(PERSON_ID, body))).status).toBe(400);
        }
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });
});

describe('grafika podpisu w pliku oferty', () => {
    it('withGraphic:true bez wskazanego miejsca -> 400 "Wskaż miejsce grafiki"', async () => {
        const error = await rejected(
            kit.controller.createJob(PERSON_ID, {
                offerId: OFFER_ID,
                files: [{ kind: 'DRIVE_FILE', gdFileId: FORM, withGraphic: true }],
            })
        );

        expect(error.status).toBe(400);
        expect(error.message).toContain('Wskaż miejsce grafiki');
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('z poprawnym miejscem zlecenie powstaje, a zapisany plik ma miejsce zaokraglone do 2 miejsc', async () => {
        const job = await startOfferJob([
            {
                kind: 'DRIVE_FILE',
                gdFileId: FORM,
                withGraphic: true,
                placement: { page: 1, rect: { x: 300.456, y: 100.004, width: 160.5, height: 50.999 } },
            },
        ]);

        const [file] = await kit.repo.listFiles(job.jobId, false);
        expect(file).toMatchObject({
            withGraphic: true,
            graphicPlacement: { page: 1, rect: { x: 300.46, y: 100, width: 160.5, height: 51 } },
        });
        expect(job.protocolUrl).toMatch(/^envi-podpis:\/\/job\//);
        noWrites();
    });

    it.each([
        ['ujemna wspolrzedna', { page: 1, rect: { x: -1, y: 100, width: 160, height: 50 } }],
        ['strona 0', { page: 0, rect: { x: 300, y: 100, width: 160, height: 50 } }],
        ['zerowa szerokosc', { page: 1, rect: { x: 300, y: 100, width: 0, height: 50 } }],
        ['NaN zamiast liczby', { page: 1, rect: { x: NaN, y: 100, width: 160, height: 50 } }],
        ['tekst zamiast liczby', { page: 1, rect: { x: '300', y: 100, width: 160, height: 50 } }],
        ['tekst zamiast strony', { page: 'jeden', rect: { x: 300, y: 100, width: 160, height: 50 } }],
    ])('miejsce grafiki z bledem (%s) -> 400, zero zlecen i zapisow', async (_label, placement) => {
        const error = await rejected(
            kit.controller.createJob(PERSON_ID, {
                offerId: OFFER_ID,
                files: [{ kind: 'DRIVE_FILE', gdFileId: FORM, withGraphic: true, placement }],
            })
        );

        expect(error.status).toBe(400);
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('bez grafiki miejsce jest ignorowane: graphicPlacement null', async () => {
        const job = await startOfferJob([
            { kind: 'DRIVE_FILE', gdFileId: FORM, withGraphic: false, placement: VALID_PLACEMENT },
        ]);

        const [file] = await kit.repo.listFiles(job.jobId, false);
        expect(file.withGraphic).toBe(false);
        expect(file.graphicPlacement).toBeNull();
    });

    it('dla pisma miejsce przy zalaczniku i przy pismie jest ignorowane (zachowanie pism bez zmian)', async () => {
        const job = await kit.controller.createJob(PERSON_ID, {
            letterId: LETTER_ID,
            files: [
                { kind: 'LETTER_DOC', withGraphic: true, placement: VALID_PLACEMENT },
                { kind: 'DRIVE_FILE', gdFileId: 'ATTACHMENT_PDF_001', withGraphic: true, placement: VALID_PLACEMENT },
            ],
        });

        const files = await kit.repo.listFiles(job.jobId, false);
        expect(files.map((f) => [f.sourceKind, f.withGraphic, f.graphicPlacement])).toEqual([
            ['LETTER_DOC', true, null],
            ['DRIVE_FILE', true, null],
        ]);
        noWrites();
    });
});

describe('szczesliwa sciezka oferty', () => {
    it('bez grafiki: certyfikat, podpisy i status done; pliki laduja w folderze Oferta, rejestr z OFFER_DOCUMENT', async () => {
        const job = await prepareOfferJob(plain(FORM, ATT2));
        expect(job.prepared.files.map((f) => f.name)).toEqual(['Formularz oferty.pdf', 'Zalacznik 2.pdf']);
        noWrites();

        const result = await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));

        expect(result).toEqual({ status: 'done' });
        expect(kit.drive.writes.map((w) => [w.op, w.name, w.parent])).toEqual([
            ['upload', 'Formularz oferty_pdp.pdf', OFFER_FILES_FOLDER_ID_001],
            ['upload', 'Zalacznik 2_pdp.pdf', OFFER_FILES_FOLDER_ID_001],
        ]);
        for (const write of kit.drive.writes) {
            const stored = kit.drive.files.get(write.id)!;
            expect(stored.parents).toEqual([OFFER_FILES_FOLDER_ID_001]);
            expect(stored.parents).not.toContain(OFFER_CASE_FOLDER_ID_0001);
            const check = validate(stored.bytes!);
            expect(check).toMatchObject({ valid: true, byteRangeCoversFile: true, signerName: 'Żaneta Gęślarz-Łoś' });
            expect(check.certSerial).toBe(identity.serialHex);
        }
        expect(
            kit.repo.signatures.map((s) => [s.sourceType, s.offerId, s.letterId, s.method, s.jobId, s.sourceGdFileId])
        ).toEqual([
            ['OFFER_DOCUMENT', OFFER_ID, null, 'LOCAL_APP', job.jobId, FORM],
            ['OFFER_DOCUMENT', OFFER_ID, null, 'LOCAL_APP', job.jobId, ATT2],
        ]);
        const status = await kit.controller.getJobStatus(job.jobId, PERSON_ID);
        expect(status).toMatchObject({ status: 'done', offerId: OFFER_ID, letterId: null });
        expect(status.files.map((f) => f.signedName)).toEqual(['Formularz oferty_pdp.pdf', 'Zalacznik 2_pdp.pdf']);
        const list = await kit.controller.listOfferSignatures(OFFER_ID);
        expect(list.offerId).toBe(OFFER_ID);
        expect(list.signatures.map((s) => s.signedName).sort()).toEqual([
            'Formularz oferty_pdp.pdf',
            'Zalacznik 2_pdp.pdf',
        ]);
        expect(
            list.signatures.every(
                (s) => s.sourceType === 'OFFER_DOCUMENT' && s.method === 'LOCAL_APP' && s.signerName === 'Żaneta Gęślarz-Łoś'
            )
        ).toBe(true);
    });

    it('z grafika w jawnym miejscu: przygotowany PDF ma widget podpisu w tym prostokacie na stronie 1', async () => {
        const withGraphic = await prepareOfferJob([
            { kind: 'DRIVE_FILE', gdFileId: FORM, withGraphic: true, placement: VALID_PLACEMENT },
        ]);
        const [stored] = await kit.repo.listFiles(withGraphic.jobId, true);
        const rects = await signatureWidgetRects(stored.preparedPdf!);

        expect(rects.map((r) => r.map((n) => Math.round(n * 100) / 100))).toEqual([[300, 100, 460, 150]]);

        const withoutGraphic = await prepareOfferJob(plain(FORM));
        const [plainStored] = await kit.repo.listFiles(withoutGraphic.jobId, true);
        expect(plainStored.preparedPdf!.equals(stored.preparedPdf!)).toBe(false);
        expect(await signatureWidgetRects(plainStored.preparedPdf!)).not.toEqual(rects);
    });
});

describe('cudza osoba i zlecenie oferty', () => {
    it('cudza osoba nie widzi stanu ani podgladu i nie anuluje zlecenia oferty (403)', async () => {
        const job = await prepareOfferJob();
        const stranger = 999;

        for (const call of [
            () => kit.controller.getJobStatus(job.jobId, stranger),
            () => kit.controller.getPreview(job.jobId, stranger, 0),
            () => kit.controller.cancelOwnJob(job.jobId, stranger, 'x'),
        ]) {
            expect((await rejected(call())).status).toBe(403);
        }
        expect(kit.repo.jobs[0].status).toBe('prepared');
        noWrites();
    });
});

describe('wszystko albo nic dla oferty', () => {
    it('awaria zapisu drugiego pliku: pierwszy wgrany wraca do kosza, zlecenie failed, brak wpisow w rejestrze', async () => {
        const job = await prepareOfferJob(plain(FORM, ATT2));
        kit.drive.failUploadAt = 2;

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error).toMatchObject({ status: 502, code: 'DRIVE_FAILED' });
        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload', 'trash']);
        expect(kit.drive.files.get(kit.drive.writes[1].id)?.trashed).toBe(true);
        expect(kit.repo.signatures).toHaveLength(0);
        expect(kit.repo.jobs[0].status).toBe('failed');
    });

    it('awaria rejestru po zapisie: wszystkie wgrane pliki wracaja do kosza, zlecenie failed, rejestr pusty', async () => {
        const job = await prepareOfferJob(plain(FORM, ATT2));
        kit.repo.failSignatureInsert = true;

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error.code).toBe('DRIVE_FAILED');
        const uploadedIds = kit.drive.writes.filter((w) => w.op === 'upload').map((w) => w.id);
        const trashedIds = kit.drive.writes.filter((w) => w.op === 'trash').map((w) => w.id);
        expect(uploadedIds).toHaveLength(2);
        expect(trashedIds).toEqual(uploadedIds);
        expect(kit.repo.signatures).toHaveLength(0);
        expect(kit.repo.jobs[0].status).toBe('failed');
    });
});

describe('zmiany na Dysku miedzy krokami zlecenia', () => {
    it('plik usuniety z folderu Oferta po zalozeniu zlecenia: certyfikat konczy zlecenie failed, zero zapisow', async () => {
        const job = await startOfferJob(plain(FORM, ATT2));
        kit.drive.files.get(OFFER_FILE_IDS.formularz)!.trashed = true;

        const error = await rejected(kit.controller.submitCertificate(job.token, certBody()));

        expect(error.message).toMatch(/Pliku „Formularz oferty.pdf” nie ma już w folderze oferty/);
        expect(kit.repo.jobs[0].status).toBe('failed');
        expect(kit.repo.jobs[0].failureMessage).toBe(error.message);
        noWrites();
    });

    it('podfolder Oferta zniknal po zalozeniu zlecenia: zlecenie failed z czytelnym komunikatem, zero zapisow', async () => {
        const job = await startOfferJob(plain(FORM));
        kit.drive.files.get(OFFER_FILES_FOLDER_ID_001)!.trashed = true;

        const error = await rejected(kit.controller.submitCertificate(job.token, certBody()));

        expect(error.message).toContain('nie ma już w folderze oferty');
        expect(kit.repo.jobs[0].status).toBe('failed');
        expect(kit.repo.jobs[0].failureMessage).toBe(error.message);
        noWrites();
    });
});

describe('Wgraj podpisany dla oferty', () => {
    let signedPdf: Buffer;

    beforeAll(async () => {
        signedPdf = await signElsewhere(identity, await makePlainPdf('Podpisywany'));
    });

    const upload = (originalname: string | undefined, buffer: Buffer = signedPdf) =>
        kit.controller.uploadSignedToOffer(PERSON_ID, OFFER_ID, { buffer, originalname });

    it('Formularz-sig.pdf trafia do folderu Oferta pod ta sama nazwa; rejestr: OFFER_DOCUMENT, MANUAL_UPLOAD, bez zrodla na Dysku', async () => {
        const result = await upload('Formularz-sig.pdf');

        expect(result.signedName).toBe('Formularz-sig.pdf');
        expect(result.signerName).toBe('Żaneta Gęślarz-Łoś');
        expect(kit.drive.writes.map((w) => [w.op, w.name, w.parent])).toEqual([
            ['upload', 'Formularz-sig.pdf', OFFER_FILES_FOLDER_ID_001],
        ]);
        expect(kit.drive.files.get(result.signedGdFileId)?.parents).toEqual([OFFER_FILES_FOLDER_ID_001]);
        expect(kit.repo.signatures).toEqual([
            expect.objectContaining({
                sourceType: 'OFFER_DOCUMENT',
                method: 'MANUAL_UPLOAD',
                sourceGdFileId: null,
                signedGdFileId: result.signedGdFileId,
                offerId: OFFER_ID,
                letterId: null,
                jobId: null,
                signerPersonId: PERSON_ID,
                certSerial: identity.serialHex,
            }),
        ]);
    });

    it('Formularz.pdf (bez -sig) dostaje sufiks _pdp', async () => {
        const result = await upload('Formularz.pdf');

        expect(result.signedName).toBe('Formularz_pdp.pdf');
        expect(kit.drive.writes.map((w) => w.name)).toEqual(['Formularz_pdp.pdf']);
    });

    it('kolizja z istniejacym podpisanym plikiem w folderze: inna nazwa, istniejacy plik nietkniety', async () => {
        const existing = kit.drive.files.get(OFFER_FILE_IDS.formularzSig)!;

        const result = await upload('Formularz oferty-sig.pdf');

        expect(result.signedName).toBe('Formularz oferty-sig_pdp.pdf');
        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload']);
        expect(kit.drive.files.get(OFFER_FILE_IDS.formularzSig)).toBe(existing);
        expect(existing.trashed).toBeFalsy();
    });

    it('dwa wgrania o tej samej nazwie: drugie dostaje inna nazwe i nie nadpisuje pierwszego', async () => {
        const first = await upload('Formularz-sig.pdf');
        const second = await upload('Formularz-sig.pdf');

        expect([first.signedName, second.signedName]).toEqual(['Formularz-sig.pdf', 'Formularz-sig_pdp.pdf']);
        expect(kit.drive.writes.filter((w) => w.op === 'trash')).toEqual([]);
    });

    it('PDF bez podpisu: 422, zero zapisow na Dysku i w rejestrze', async () => {
        const error = await rejected(upload('Bez podpisu.pdf', await makePlainPdf('Bez podpisu')));

        expect(error.status).toBe(422);
        expect(error.message).toContain('nie ma podpisu');
        noWrites();
        expect(kit.repo.signatures).toHaveLength(0);
    });

    it('nazwa ze sciezka (..\\..\\x-sig.pdf) zapisana bez sciezki', async () => {
        const result = await upload('..\\..\\x-sig.pdf');

        expect(result.signedName).toBe('x-sig.pdf');
        expect(kit.drive.writes.map((w) => [w.name, w.parent])).toEqual([['x-sig.pdf', OFFER_FILES_FOLDER_ID_001]]);
    });

    it('polska nazwa przyslana jak robi multer (latin1 z bajtow UTF-8) zapisana poprawnie', async () => {
        const multerName = Buffer.from('Oświadczenie-sig.pdf', 'utf8').toString('latin1');

        const result = await upload(multerName);

        expect(result.signedName).toBe('Oświadczenie-sig.pdf');
        expect(kit.drive.writes.map((w) => w.name)).toEqual(['Oświadczenie-sig.pdf']);
    });
});

describe('grafika w pliku oferty: miejsca i podglad strony', () => {
    it('miejsca dla pliku z folderu Oferta: pages (liczba stron) i candidates (tablica)', async () => {
        const result = await kit.controller.locateOfferGraphicPlace(OFFER_ID, FORM);

        expect(result.pages).toHaveLength(1);
        expect(Array.isArray(result.candidates)).toBe(true);
        noWrites();
    });

    it('miejsca dla pliku spoza folderu Oferta: 409', async () => {
        const error = await rejected(kit.controller.locateOfferGraphicPlace(OFFER_ID, 'ATTACHMENT_PDF_001'));

        expect(error.status).toBe(409);
        noWrites();
    });

    it('miejsca dla nieprawidlowego identyfikatora pliku: 400', async () => {
        const error = await rejected(kit.controller.locateOfferGraphicPlace(OFFER_ID, 'x'));

        expect(error.status).toBe(400);
        noWrites();
    });

    it('obraz strony 1 to PNG', async () => {
        const png = await kit.controller.renderOfferFilePage(OFFER_ID, FORM, 1);

        expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        noWrites();
    });

    it('obraz nieistniejacej strony (99): 404', async () => {
        const error = await rejected(kit.controller.renderOfferFilePage(OFFER_ID, FORM, 99));

        expect(error.status).toBe(404);
    });

    it('obraz strony 0: 400', async () => {
        const error = await rejected(kit.controller.renderOfferFilePage(OFFER_ID, FORM, 0));

        expect(error.status).toBe(400);
    });
});

describe('kolejny podpis w ofercie', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each(['x-sig.pdf', 'x_sig', 'x_podpisany.pdf', 'x-sig-sig', 'x_sig_20261011-123456_2.pdf'])(
        'cudzy podpis %s jest oznaczony; nasze datowane kopie sa ukryte', async (name) => {
            kit.drive.add({ id: 'EXTERNAL_SIGNED_00001', name, mimeType: MIME.pdf, parents: [OFFER_FILES_FOLDER_ID_001] });
            for (const [i, own] of ['x_pdp.pdf', 'x_pdp_20261011-123456.pdf', 'x_pdp_20261011-123456_2.pdf'].entries()) {
                kit.drive.add({ id: `OWN_COPY_0000000${i}`, name: own, mimeType: MIME.pdf, parents: [OFFER_FILES_FOLDER_ID_001] });
                await expect(startOfferJob(plain(`OWN_COPY_0000000${i}`))).rejects.toMatchObject({ status: 409 });
            }
            const list = await kit.controller.listOfferSignableFiles(OFFER_ID);
            expect(list.files.find((f) => f.name === name)).toMatchObject({ signedNameHint: true });
            expect(list.files.some((f) => f.name.startsWith('x_pdp'))).toBe(false);
        }
    );

    it('plik -sig jest oznaczony, wybieralny i dostaje nazwe -sig_pdp', async () => {
        const foreign = await makeIdentity({ commonName: 'Partner' });
        kit.drive.files.get(OFFER_FILE_IDS.formularzSig)!.bytes = await signElsewhere(foreign, await makePlainPdf('Partner'));
        const list = await kit.controller.listOfferSignableFiles(OFFER_ID);
        expect(list.files.find((f) => f.gdFileId === OFFER_FILE_IDS.formularzSig)).toMatchObject({ signedNameHint: true });
        const job = await prepareOfferJob(plain(OFFER_FILE_IDS.formularzSig));
        expect(await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared))).toEqual({ status: 'done' });
        expect(kit.drive.writes[0].name).toBe('Formularz oferty-sig_pdp.pdf');
        expect(validate(kit.drive.files.get(kit.drive.writes[0].id)!.bytes!).signatures).toHaveLength(2);
    });

    it.each(['earlier invalid', 'last foreign', 'last incomplete', 'last invalid', 'empty'])(
        'kontrola ostatniego podpisu: %s', async (variant) => {
            const job = await prepareOfferJob();
            const actualValidate = validate;
            jest.spyOn(signing, 'validate').mockImplementation((pdf) => {
                const check = actualValidate(pdf);
                const last = { ...check.signatures[check.signatures.length - 1] };
                if (variant === 'last foreign') last.certSerial = 'FOREIGN';
                if (variant === 'last incomplete') last.byteRangeCoversFile = false;
                if (variant === 'last invalid') last.valid = false;
                return { ...check, valid: variant !== 'earlier invalid', signatures: variant === 'empty' ? [] : [{ ...last, valid: false, certSerial: 'PARTNER', byteRangeCoversFile: false }, last] };
            });
            const result = kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));
            if (variant === 'earlier invalid') {
                await expect(result).resolves.toEqual({ status: 'done' });
            } else {
                await expect(result).rejects.toMatchObject({ code: 'SIGNATURE_REJECTED', status: 422 });
                noWrites();
                expect(kit.repo.jobs[0].status).toBe('failed');
            }
        }
    );

    it.each([
        ['PDF_LOCKED', 'jest zabezpieczony przed zmianami przez wcześniejszy podpis - podpisz go w Szafirze i użyj „Wgraj podpisany”'],
        ['PDF_INCREMENTAL_UNSUPPORTED', 'ma budowę, przy której PS nie umie dodać kolejnego podpisu - podpisz go w Szafirze i użyj „Wgraj podpisany”'],
        ['SIGNATURE_WIDGET_OVERLAP', 'ma już podpis w tym miejscu - wskaż inne miejsce na grafikę'],
    ] as const)('%s trafia do komunikatu zlecenia', async (code, text) => {
        const job = await startOfferJob();
        jest.spyOn(signing, 'prepare').mockRejectedValueOnce(new SigningError(code, 'library detail'));
        const error = await rejected(kit.controller.submitCertificate(job.token, certBody()));
        expect(error).toMatchObject({ code: 'PREPARE_FAILED', status: 422, message: `Plik „Formularz oferty.pdf” ${text}.` });
        expect((await kit.controller.getJobStatus(job.jobId, PERSON_ID)).failureMessage).toBe(error.message);
        noWrites();
    });
});
