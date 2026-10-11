import { finalize, prepare, validate } from '../..';
import { SigningJobError } from '../SigningJobError';
import {
    Kit,
    KitIdentity,
    LETTER_FOLDER_ID,
    LETTER_ID,
    MIME,
    OFFER_ID,
    PERSON_ID,
    b64,
    makeIdentity,
    makeKit,
    makePlainPdf,
    softwareCardSign,
    tokenOf,
} from './jobsTestKit';

// Fixture dokumentow umowy ENVI jest zbudowany lokalnie w tym pliku: atrapa Dysku z jednego kitu
// nie zawiera folderu umowy. Repozytorium w pamieci (kit.repo.contracts) dostaje rekordy umow.

const CONTRACT_ID = 4001;
const CONTRACT_LABEL = 'ENVI/UM/2026/17';
const CONTRACT_FOLDER_ID = 'CONTRACT_FOLDER_ID_0001';
const CONTRACT_SUBFOLDER_ID = 'CONTRACT_SUBFOLDER_0001';
/** Folder, do ktorego przenosimy plik umowy w tescie "przeniesiony z folderu". */
const OTHER_FOLDER_ID = 'OTHER_FOLDER_ID_00001';
/** Umowa, ktora nie jest nasza (isOur: false). */
const FOREIGN_CONTRACT_ID = 4002;
/** Umowa ENVI bez folderu sprawy "Umowa i zmiany". */
const NO_FOLDER_CONTRACT_ID = 4003;
/** Umowa ENVI z dwoma roznymi folderami sprawy "Umowa i zmiany". */
const TWO_FOLDERS_CONTRACT_ID = 4004;
const UNKNOWN_CONTRACT_ID = 987654;
const SECOND_CASE_FOLDER_ID = 'CONTRACT_FOLDER_ID_0002';

const UMOWA = 'CONTRACT_UMOWA_ID_0001';
const ANEKS = 'CONTRACT_ANEKS_ID_0001';
const WZOR_DOCX = 'CONTRACT_WZOR_ID_0001';
/** Obcy plik: zalacznik pisma z atrapy Dysku (lezy w folderze pisma, nie w folderze umowy). */
const FOREIGN_FILE = 'ATTACHMENT_PDF_001';
const VALID_PLACEMENT = { page: 1, rect: { x: 300, y: 100, width: 160, height: 50 } };

let identity: KitIdentity;
let kit: Kit;

beforeAll(async () => {
    identity = await makeIdentity({ commonName: 'Żaneta Gęślarz-Łoś' });
});

beforeEach(async () => {
    kit = await makeKit(identity.allowlist);
    await addContractFixture(kit);
});

async function addContractFixture(k: Kit): Promise<void> {
    k.repo.contracts.set(CONTRACT_ID, {
        id: CONTRACT_ID,
        label: CONTRACT_LABEL,
        isOur: true,
        documentFolderIds: [CONTRACT_FOLDER_ID],
    });
    k.repo.contracts.set(FOREIGN_CONTRACT_ID, {
        id: FOREIGN_CONTRACT_ID,
        label: 'ZEW/1/2026',
        isOur: false,
        documentFolderIds: [CONTRACT_FOLDER_ID],
    });
    k.repo.contracts.set(NO_FOLDER_CONTRACT_ID, {
        id: NO_FOLDER_CONTRACT_ID,
        label: 'ENVI/UM/2026/18',
        isOur: true,
        documentFolderIds: [],
    });
    k.repo.contracts.set(TWO_FOLDERS_CONTRACT_ID, {
        id: TWO_FOLDERS_CONTRACT_ID,
        label: 'ENVI/UM/2026/19',
        isOur: true,
        documentFolderIds: [CONTRACT_FOLDER_ID, SECOND_CASE_FOLDER_ID],
    });
    k.drive.add(
        { id: UMOWA, name: 'Umowa ENVI.pdf', mimeType: MIME.pdf, size: 1000, parents: [CONTRACT_FOLDER_ID] },
        await makePlainPdf('Umowa ENVI')
    );
    k.drive.add(
        { id: ANEKS, name: 'Aneks 1.pdf', mimeType: MIME.pdf, size: 1000, parents: [CONTRACT_FOLDER_ID] },
        await makePlainPdf('Aneks 1')
    );
    k.drive.add({
        id: WZOR_DOCX,
        name: 'Wzor.docx',
        mimeType: MIME.docx,
        size: 5000,
        parents: [CONTRACT_FOLDER_ID],
    });
    k.drive.add({
        id: CONTRACT_SUBFOLDER_ID,
        name: 'Podfolder',
        mimeType: MIME.folder,
        parents: [CONTRACT_FOLDER_ID],
    });
}

/** Wybor plikow z folderu umowy do zlecenia, bez grafiki. */
const plain = (...gdFileIds: string[]) =>
    gdFileIds.map((gdFileId) => ({ kind: 'DRIVE_FILE', gdFileId, withGraphic: false }));

async function startContractJob(files: unknown[] = plain(UMOWA), personId = PERSON_ID) {
    const created = await kit.controller.createJob(personId, { contractId: CONTRACT_ID, files });
    return { ...created, token: tokenOf(created.protocolUrl) };
}

const certBody = (id: KitIdentity = identity) => ({ chain: id.chainDer.map(b64) });

async function prepareContractJob(files: unknown[] = plain(UMOWA), id: KitIdentity = identity) {
    const job = await startContractJob(files);
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

describe('lista dokumentow umowy ENVI', () => {
    it('folder umowy: numer i etykieta, PDF-y jako zalaczniki bez grafiki, bez glownego dokumentu', async () => {
        const result = await kit.controller.listContractSignableFiles(CONTRACT_ID);

        expect(result).toMatchObject({ contractId: CONTRACT_ID, contractLabel: CONTRACT_LABEL });
        expect(result.files).toEqual([
            { kind: 'DRIVE_FILE', gdFileId: UMOWA, name: 'Umowa ENVI.pdf', mimeType: MIME.pdf, withGraphic: false, graphicLocked: false },
            { kind: 'DRIVE_FILE', gdFileId: ANEKS, name: 'Aneks 1.pdf', mimeType: MIME.pdf, withGraphic: false, graphicLocked: false },
        ]);
        noWrites();
    });

    it('tylko kopie _pdp sa ukryte; cudze podpisy sa proponowane; DOCX idzie do nieobslugiwanych; podfolder pominiety', async () => {
        for (const [id, name] of [
            ['CONTRACT_PDP_ID_0001', 'umowa_pdp.pdf'],
            ['CONTRACT_SIG_ID_0001', 'umowa-sig.pdf'],
            ['CONTRACT_SIGSIG_ID_01', 'umowa-sig-sig.pdf'],
            ['CONTRACT_PODP_ID_0001', 'umowa_podpisany.pdf'],
        ]) {
            kit.drive.add(
                { id, name, mimeType: MIME.pdf, size: 1000, parents: [CONTRACT_FOLDER_ID] },
                await makePlainPdf(name)
            );
        }

        const result = await kit.controller.listContractSignableFiles(CONTRACT_ID);

        expect(result.files.map((f) => f.name)).toEqual(['Umowa ENVI.pdf', 'Aneks 1.pdf', 'umowa-sig.pdf', 'umowa-sig-sig.pdf', 'umowa_podpisany.pdf']);
        expect(result.notSignable.map((f) => f.name)).toEqual(['Wzor.docx']);
        const listed = [...result.files, ...result.notSignable].map((f) => f.name);
        for (const hidden of ['umowa_pdp.pdf', 'Podfolder']) {
            expect(listed).not.toContain(hidden);
        }
        expect(result.files.filter((f) => f.signedNameHint).map((f) => f.name)).toEqual(['umowa-sig.pdf', 'umowa-sig-sig.pdf', 'umowa_podpisany.pdf']);
        await expect(kit.controller.createJob(PERSON_ID, { contractId: CONTRACT_ID, files: plain('CONTRACT_SIG_ID_0001') })).resolves.toHaveProperty('jobId');
        await expect(kit.controller.createJob(PERSON_ID, { contractId: CONTRACT_ID, files: plain('CONTRACT_PDP_ID_0001') })).rejects.toMatchObject({ status: 409 });
        noWrites();
    });

    it('umowa, ktora nie jest nasza (isOur: false): 400 z komunikatem o umowach ENVI, bez czytania folderu', async () => {
        const error = await rejected(kit.controller.listContractSignableFiles(FOREIGN_CONTRACT_ID));

        expect(error.status).toBe(400);
        expect(error.message).toContain('tylko dokumenty umów ENVI');
        expect(kit.drive.reads).toEqual([]);
        noWrites();
    });

    it('nieistniejaca umowa: 404 (lista i zlecenie)', async () => {
        const list = await rejected(kit.controller.listContractSignableFiles(UNKNOWN_CONTRACT_ID));
        const job = await rejected(
            kit.controller.createJob(PERSON_ID, { contractId: UNKNOWN_CONTRACT_ID, files: plain(UMOWA) })
        );

        expect(list.status).toBe(404);
        expect(job.status).toBe(404);
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('nieprawidlowy identyfikator umowy (0, -1, 1.5): 400 przy liscie i przy zleceniu', async () => {
        for (const contractId of [0, -1, 1.5]) {
            expect((await rejected(kit.controller.listContractSignableFiles(contractId))).status).toBe(400);
            expect(
                (await rejected(kit.controller.createJob(PERSON_ID, { contractId, files: plain(UMOWA) }))).status
            ).toBe(400);
        }
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('brak folderu sprawy "Umowa i zmiany": 409', async () => {
        const error = await rejected(kit.controller.listContractSignableFiles(NO_FOLDER_CONTRACT_ID));

        expect(error.status).toBe(409);
        expect(error.message).toContain('nie ma na Dysku Google folderu sprawy');
        noWrites();
    });

    it('dwa rozne foldery sprawy "Umowa i zmiany": 409', async () => {
        const error = await rejected(kit.controller.listContractSignableFiles(TWO_FOLDERS_CONTRACT_ID));

        expect(error.status).toBe(409);
        expect(error.message).toContain('więcej niż jedną sprawę');
        noWrites();
    });
});

describe('rola zakresowa nie dostaje dokumentow umowy', () => {
    it('kazde wywolanie umowy z zakresem projektu daje 403, bez sprawdzania pisma i bez zapisow', async () => {
        const scope = { projectOurIds: ['2023.10'] };
        const calls: Array<() => Promise<unknown>> = [
            () => kit.controller.listContractSignableFiles(CONTRACT_ID, scope),
            () => kit.controller.createJob(PERSON_ID, { contractId: CONTRACT_ID, files: plain(UMOWA) }, scope),
            () =>
                kit.controller.uploadSignedToContract(
                    PERSON_ID,
                    CONTRACT_ID,
                    { buffer: Buffer.from('%PDF-1.4') },
                    scope
                ),
            () => kit.controller.listContractSignatures(CONTRACT_ID, scope),
            () => kit.controller.locateContractGraphicPlace(CONTRACT_ID, UMOWA, scope),
            () => kit.controller.renderContractFilePage(CONTRACT_ID, UMOWA, 1, scope),
        ];

        for (const call of calls) expect((await rejected(call())).status).toBe(403);
        expect(kit.scopeCalls).toEqual([]); // zakres pisma nie jest sprawdzany dla umowy
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });
});

describe('grafika podpisu i obraz strony w pliku umowy', () => {
    it('miejsca dla pliku z folderu umowy: pages (liczba stron), candidates (tablica) i stampRel (wymiary grafiki)', async () => {
        const result = await kit.controller.locateContractGraphicPlace(CONTRACT_ID, UMOWA);

        expect(result.pages).toHaveLength(1);
        expect(Array.isArray(result.candidates)).toBe(true);
        expect(result.stampRel.width).toBeGreaterThan(0);
        expect(result.stampRel.height).toBeGreaterThan(0);
        noWrites();
    });

    it('miejsca dla pliku spoza folderu umowy: 409, a nazwa obcego pliku nie pojawia sie w komunikacie', async () => {
        const error = await rejected(kit.controller.locateContractGraphicPlace(CONTRACT_ID, FOREIGN_FILE));

        expect(error.status).toBe(409);
        expect(error.message).not.toContain('Zalacznik 1');
        noWrites();
    });

    it('miejsca dla nieprawidlowego identyfikatora pliku: 400', async () => {
        const error = await rejected(kit.controller.locateContractGraphicPlace(CONTRACT_ID, 'x'));

        expect(error.status).toBe(400);
        noWrites();
    });

    it('obraz strony 1 umowy to PNG', async () => {
        const png = await kit.controller.renderContractFilePage(CONTRACT_ID, UMOWA, 1);

        expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        noWrites();
    });

    it('obraz nieistniejacej strony (99): 404', async () => {
        const error = await rejected(kit.controller.renderContractFilePage(CONTRACT_ID, UMOWA, 99));

        expect(error.status).toBe(404);
    });

    it('obraz strony 0: 400', async () => {
        const error = await rejected(kit.controller.renderContractFilePage(CONTRACT_ID, UMOWA, 0));

        expect(error.status).toBe(400);
    });
});

describe('zlecenie podpisu dla umowy', () => {
    it('zlecenie zapisuje contractId, a letterId i offerId zostaja puste', async () => {
        const job = await startContractJob(plain(UMOWA));

        expect(kit.repo.jobs[0]).toMatchObject({ id: job.jobId, contractId: CONTRACT_ID, letterId: null, offerId: null });
        noWrites();
    });

    it('withGraphic:true bez miejsca -> 400 "Wskaż miejsce grafiki"; z poprawnym miejscem miejsce trafia do pliku zlecenia', async () => {
        const error = await rejected(
            kit.controller.createJob(PERSON_ID, {
                contractId: CONTRACT_ID,
                files: [{ kind: 'DRIVE_FILE', gdFileId: UMOWA, withGraphic: true }],
            })
        );
        expect(error.status).toBe(400);
        expect(error.message).toContain('Wskaż miejsce grafiki');
        expect(kit.repo.jobs).toHaveLength(0);

        const job = await startContractJob([
            { kind: 'DRIVE_FILE', gdFileId: UMOWA, withGraphic: true, placement: VALID_PLACEMENT },
        ]);
        const [file] = await kit.repo.listFiles(job.jobId, false);
        expect(file).toMatchObject({ withGraphic: true, graphicPlacement: VALID_PLACEMENT });
        noWrites();
    });

    it('plik spoza folderu umowy (zalacznik pisma) -> 409 "nie jest juz dostepny"', async () => {
        const error = await rejected(kit.controller.createJob(PERSON_ID, { contractId: CONTRACT_ID, files: plain(FOREIGN_FILE) }));

        expect(error.status).toBe(409);
        expect(error.message).toContain('nie jest już dostępny');
        expect(kit.repo.jobs).toHaveLength(0);
        noWrites();
    });

    it('szczesliwa sciezka: certyfikat, podpisy, status done; kopie laduja w folderze umowy jako <nazwa>_pdp.pdf; rejestr CONTRACT_DOCUMENT', async () => {
        const job = await prepareContractJob(plain(UMOWA, ANEKS));
        expect(job.prepared.files.map((f) => f.name)).toEqual(['Umowa ENVI.pdf', 'Aneks 1.pdf']);
        noWrites();

        const result = await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));

        expect(result).toEqual({ status: 'done' });
        expect(kit.drive.writes.map((w) => [w.op, w.name, w.parent])).toEqual([
            ['upload', 'Umowa ENVI_pdp.pdf', CONTRACT_FOLDER_ID],
            ['upload', 'Aneks 1_pdp.pdf', CONTRACT_FOLDER_ID],
        ]);
        for (const write of kit.drive.writes) {
            const stored = kit.drive.files.get(write.id)!;
            expect(stored.parents).toEqual([CONTRACT_FOLDER_ID]);
            const check = validate(stored.bytes!);
            expect(check).toMatchObject({ valid: true, byteRangeCoversFile: true, signerName: 'Żaneta Gęślarz-Łoś' });
            expect(check.certSerial).toBe(identity.serialHex);
        }
        expect(
            kit.repo.signatures.map((s) => [s.sourceType, s.contractId, s.letterId, s.offerId, s.method, s.jobId, s.sourceGdFileId])
        ).toEqual([
            ['CONTRACT_DOCUMENT', CONTRACT_ID, null, null, 'LOCAL_APP', job.jobId, UMOWA],
            ['CONTRACT_DOCUMENT', CONTRACT_ID, null, null, 'LOCAL_APP', job.jobId, ANEKS],
        ]);
        const status = await kit.controller.getJobStatus(job.jobId, PERSON_ID);
        expect(status).toMatchObject({ status: 'done', contractId: CONTRACT_ID, letterId: null, offerId: null });
        expect(status.files.map((f) => f.signedName)).toEqual(['Umowa ENVI_pdp.pdf', 'Aneks 1_pdp.pdf']);
        const list = await kit.controller.listContractSignatures(CONTRACT_ID);
        expect(list.contractId).toBe(CONTRACT_ID);
        expect(list.signatures.map((s) => s.signedName).sort()).toEqual(['Aneks 1_pdp.pdf', 'Umowa ENVI_pdp.pdf']);
        expect(
            list.signatures.every(
                (s) => s.sourceType === 'CONTRACT_DOCUMENT' && s.method === 'LOCAL_APP' && s.signerName === 'Żaneta Gęślarz-Łoś'
            )
        ).toBe(true);
    });

    it('plik przeniesiony z folderu umowy po zalozeniu zlecenia: certyfikat konczy zlecenie failed, zero zapisow', async () => {
        const job = await startContractJob(plain(UMOWA));
        kit.drive.files.get(UMOWA)!.parents = [OTHER_FOLDER_ID];

        const error = await rejected(kit.controller.submitCertificate(job.token, certBody()));

        expect(error.status).toBe(409);
        expect(error.message).toContain('nie ma już w folderze umowy');
        expect(kit.repo.jobs[0].status).toBe('failed');
        expect(kit.repo.jobs[0].failureMessage).toBe(error.message);
        noWrites();
        expect(kit.repo.signatures).toHaveLength(0);
    });
});

describe('Wgraj podpisany dla umowy', () => {
    let signedPdf: Buffer;

    beforeAll(async () => {
        signedPdf = await signElsewhere(identity, await makePlainPdf('Podpisywany'));
    });

    const upload = (originalname: string | undefined, buffer: Buffer = signedPdf) =>
        kit.controller.uploadSignedToContract(PERSON_ID, CONTRACT_ID, { buffer, originalname });

    it('umowa-sig.pdf (wolna nazwa, wyglada na kopie) zostaje bez zmian; rejestr CONTRACT_DOCUMENT, MANUAL_UPLOAD', async () => {
        const result = await upload('umowa-sig.pdf');

        expect(result.signedName).toBe('umowa-sig.pdf');
        expect(result.signerName).toBe('Żaneta Gęślarz-Łoś');
        expect(kit.drive.writes.map((w) => [w.op, w.name, w.parent])).toEqual([
            ['upload', 'umowa-sig.pdf', CONTRACT_FOLDER_ID],
        ]);
        expect(kit.drive.files.get(result.signedGdFileId)?.parents).toEqual([CONTRACT_FOLDER_ID]);
        expect(kit.repo.signatures).toEqual([
            expect.objectContaining({
                sourceType: 'CONTRACT_DOCUMENT',
                method: 'MANUAL_UPLOAD',
                sourceGdFileId: null,
                signedGdFileId: result.signedGdFileId,
                contractId: CONTRACT_ID,
                letterId: null,
                offerId: null,
                jobId: null,
                signerPersonId: PERSON_ID,
                certSerial: identity.serialHex,
            }),
        ]);
    });

    it('Umowa.pdf (bez -sig) dostaje sufiks _pdp', async () => {
        const result = await upload('Umowa.pdf');

        expect(result.signedName).toBe('Umowa_pdp.pdf');
        expect(kit.drive.writes.map((w) => w.name)).toEqual(['Umowa_pdp.pdf']);
    });

    it('umowa-sig.pdf juz zajety w folderze: nazwa z sufiksem _pdp, istniejacy plik nietkniety', async () => {
        kit.drive.add({ id: 'CONTRACT_TAKEN_ID_0001', name: 'umowa-sig.pdf', mimeType: MIME.pdf, parents: [CONTRACT_FOLDER_ID] });
        const before = kit.drive.files.get('CONTRACT_TAKEN_ID_0001');

        const result = await upload('umowa-sig.pdf');

        expect(result.signedName).toBe('umowa-sig_pdp.pdf');
        expect(kit.drive.files.get('CONTRACT_TAKEN_ID_0001')).toBe(before);
        expect(before?.trashed).toBeFalsy();
        expect(kit.drive.writes.filter((w) => w.op === 'trash')).toEqual([]);
    });

    it('PDF bez podpisu: 422, zero zapisow na Dysku i w rejestrze', async () => {
        const error = await rejected(upload('Bez podpisu.pdf', await makePlainPdf('Bez podpisu')));

        expect(error.status).toBe(422);
        expect(error.message).toContain('nie ma podpisu');
        noWrites();
        expect(kit.repo.signatures).toHaveLength(0);
    });

    it('listContractSignatures zwraca tylko podpisy tej umowy (bez podpisow pisma i oferty)', async () => {
        await upload('umowa-sig.pdf');
        await kit.controller.uploadSignedToOffer(PERSON_ID, OFFER_ID, { buffer: signedPdf, originalname: 'Oferta-sig.pdf' });
        await kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: signedPdf });

        const list = await kit.controller.listContractSignatures(CONTRACT_ID);

        expect(list.contractId).toBe(CONTRACT_ID);
        expect(list.signatures.map((s) => [s.sourceType, s.signedName])).toEqual([['CONTRACT_DOCUMENT', 'umowa-sig.pdf']]);
    });
});

describe('regresja: pismo i oferta bez zmian po dodaniu umowy', () => {
    it('lista pisma nadal pokazuje dokument pisma, zalaczniki i pomija eksport oraz podpisana kopie', async () => {
        const result = await kit.controller.listSignableFiles(LETTER_ID);

        expect(result.files.map((f) => f.name)).toEqual(['Pismo testowe', 'Zalacznik 1.pdf', 'Notatka']);
        noWrites();
    });

    it('lista oferty nadal pokazuje tylko pliki z folderu Oferta', async () => {
        const result = await kit.controller.listOfferSignableFiles(OFFER_ID);

        expect(result.files.map((f) => f.name)).toEqual(['Formularz oferty.pdf', 'Zalacznik 2.pdf', 'Formularz oferty-sig.pdf']);
        noWrites();
    });
});

describe('po przegladzie Sola (SIG-6)', () => {
    it('folder sprawy podmieniony w bazie po przygotowaniu: podpisy odrzucone, zero zapisow, zlecenie failed', async () => {
        const job = await prepareContractJob(plain(UMOWA));
        kit.repo.contracts.get(CONTRACT_ID)!.documentFolderIds = [SECOND_CASE_FOLDER_ID];

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error.status).toBe(409);
        expect(error.message).toContain('nie ma już w folderze umowy');
        expect(kit.repo.jobs[0].status).toBe('failed');
        noWrites();
        expect(kit.repo.signatures).toHaveLength(0);
    });

    it('plik zrodlowy przeniesiony po przygotowaniu: podpisy odrzucone, zero zapisow', async () => {
        const job = await prepareContractJob(plain(UMOWA));
        kit.drive.files.get(UMOWA)!.parents = [OTHER_FOLDER_ID];

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error.status).toBe(409);
        noWrites();
        expect(kit.repo.signatures).toHaveLength(0);
    });

    it('kopia ze znacznikiem czasu (<nazwa>_pdp_<data>.pdf) nie jest proponowana do podpisu: umowa i pismo', async () => {
        const bytes = await makePlainPdf('kopia');
        kit.drive.add(
            { id: 'CONTRACT_STAMPED_00001', name: 'Umowa ENVI_pdp_20261010-221500.pdf', mimeType: MIME.pdf, size: 1000, parents: [CONTRACT_FOLDER_ID] },
            bytes
        );
        kit.drive.add(
            { id: 'LETTER_STAMPED_0000001', name: 'Zalacznik 1_pdp_20261010-221500_2.pdf', mimeType: MIME.pdf, size: 1000, parents: [LETTER_FOLDER_ID] },
            bytes
        );

        const contract = await kit.controller.listContractSignableFiles(CONTRACT_ID);
        const letter = await kit.controller.listSignableFiles(LETTER_ID);

        expect(contract.files.map((f) => f.name)).toEqual(['Umowa ENVI.pdf', 'Aneks 1.pdf']);
        expect(letter.files.map((f) => f.name)).toEqual(['Pismo testowe', 'Zalacznik 1.pdf', 'Notatka']);
    });

    it('nazwa, w ktorej "pdp" jest poczatkiem dluzszego slowa, zostaje na liscie', async () => {
        kit.drive.add(
            { id: 'CONTRACT_PDPX_00000001', name: 'Plan_pdpx.pdf', mimeType: MIME.pdf, size: 1000, parents: [CONTRACT_FOLDER_ID] },
            await makePlainPdf('plan')
        );

        const contract = await kit.controller.listContractSignableFiles(CONTRACT_ID);

        expect(contract.files.map((f) => f.name)).toContain('Plan_pdpx.pdf');
    });
});

describe('po przegladzie wizualnym (SIG-6)', () => {
    it('plik, ktory ma juz podpis elektroniczny: przy wlaczeniu grafiki zwraca miejsca', async () => {
        const signed = await signElsewhere(identity, await makePlainPdf('Umowa podpisana przez druga strone'));
        kit.drive.add(
            { id: 'CONTRACT_SIGNED_0000001', name: 'Umowa podpisana.pdf', mimeType: MIME.pdf, size: 1000, parents: [CONTRACT_FOLDER_ID] },
            signed
        );

        const places = await kit.controller.locateContractGraphicPlace(CONTRACT_ID, 'CONTRACT_SIGNED_0000001');
        expect(places.pages).toHaveLength(1);
        expect(Array.isArray(places.candidates)).toBe(true);
    });
});
