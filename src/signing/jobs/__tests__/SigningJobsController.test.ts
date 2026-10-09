import { createHash, randomBytes } from 'crypto';
import { validate } from '../..';
import { verifySigningCertificate } from '../CertificateVerifier';
import { SigningJobError } from '../SigningJobError';
import { JOB_TTL_MS } from '../SigningJobsConfig';
import { signedFileName } from '../SigningJobsController';
import {
    KitIdentity,
    Kit,
    LETTER_FOLDER_ID,
    LETTER_ID,
    PERSON_ID,
    b64,
    makeIdentity,
    makeKit,
    makeLetterPdf,
    sha256Hex,
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

const LETTER_ONLY = [{ kind: 'LETTER_DOC', withGraphic: true }];
const LETTER_AND_ATTACHMENTS = [
    { kind: 'LETTER_DOC', withGraphic: false }, // serwer wymusza grafike
    { kind: 'DRIVE_FILE', gdFileId: 'ATTACHMENT_PDF_001', withGraphic: true },
    { kind: 'DRIVE_FILE', gdFileId: 'ATTACHMENT_DOC_001', withGraphic: false },
];

async function startJob(files: unknown[] = LETTER_ONLY, personId = PERSON_ID) {
    const created = await kit.controller.createJob(personId, { letterId: LETTER_ID, files });
    return { ...created, token: tokenOf(created.protocolUrl) };
}

const certBody = (id: KitIdentity = identity) => ({ chain: id.chainDer.map(b64) });

async function prepareJob(files: unknown[] = LETTER_ONLY, id: KitIdentity = identity) {
    const job = await startJob(files);
    const prepared = await kit.controller.submitCertificate(job.token, certBody(id));
    return { ...job, prepared };
}

/** Karta: dostaje tylko skrot (hex) i zwraca podpis RSA. */
function cardSignatures(
    prepared: { files: Array<{ hashToSign: string }> },
    id: KitIdentity = identity
) {
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

describe('lista plikow do podpisu', () => {
    it('pismo z blokada grafiki, zalaczniki PDF/Doc, pomija eksport pisma i stare podpisane, reszte oznacza jako niepodpisywalna', async () => {
        const result = await kit.controller.listSignableFiles(LETTER_ID);

        expect(result.files.map((f) => [f.kind, f.name, f.withGraphic, f.graphicLocked])).toEqual([
            ['LETTER_DOC', 'Pismo testowe', true, true],
            ['DRIVE_FILE', 'Zalacznik 1.pdf', false, false],
            ['DRIVE_FILE', 'Notatka', false, false],
        ]);
        expect(result.notSignable.map((f) => f.name)).toEqual(['Umowa.docx']);
        expect(result.notSignable[0].reason).toMatch(/PDF oraz Dokumenty i Arkusze Google/);
    });

    it('sprawdza zakres projektu pisma przed czymkolwiek innym', async () => {
        kit.rejectScope.value = true;

        const error: any = await kit.controller.listSignableFiles(LETTER_ID, { projectOurIds: ['X'] }).catch((e) => e);

        expect(error.status).toBe(403);
        expect(kit.scopeCalls).toEqual([{ letterId: LETTER_ID, scope: { projectOurIds: ['X'] } }]);
        expect(kit.drive.reads).toEqual([]);
    });
});

describe('zakladanie zlecenia', () => {
    it('zwraca link z tokenem, w bazie jest tylko skrot SHA-256, wygasa po 10 minutach', async () => {
        const created = await startJob(LETTER_AND_ATTACHMENTS);

        expect(created.protocolUrl).toMatch(/^envi-podpis:\/\/job\/[A-Za-z0-9_-]{43}$/);
        expect(new Date(created.expiresAt).getTime()).toBe(kit.clock.now.getTime() + JOB_TTL_MS);
        const stored = kit.repo.jobs[0];
        expect(stored.tokenHash).toBe(createHash('sha256').update(created.token).digest('hex'));
        expect(JSON.stringify(kit.repo.jobs)).not.toContain(created.token);
        // pismo zawsze z grafika, zalaczniki wg wyboru
        const files = await kit.repo.listFiles(created.jobId, false);
        expect(files.map((f) => [f.sourceKind, f.withGraphic])).toEqual([
            ['LETTER_DOC', true],
            ['DRIVE_FILE', true],
            ['DRIVE_FILE', false],
        ]);
    });

    it('odrzuca plik spoza folderu pisma, eksport pisma, stary podpisany, nieobslugiwany format i smieci', async () => {
        for (const gdFileId of [
            'NIE_MA_TAKIEGO_PLIKU',
            'EXPORT_PDF_ID_0001',
            'OLD_SIGNED_ID_0001',
            'ATTACHMENT_DOCX_01',
        ]) {
            const error = await rejected(
                kit.controller.createJob(PERSON_ID, {
                    letterId: LETTER_ID,
                    files: [{ kind: 'DRIVE_FILE', gdFileId, withGraphic: false }],
                })
            );
            expect(error.status).toBe(409);
        }
        for (const body of [
            { letterId: LETTER_ID, files: [] },
            { letterId: 'x', files: LETTER_ONLY },
            { letterId: LETTER_ID, files: [{ kind: 'INNE' }] },
            { letterId: LETTER_ID, files: [{ kind: 'DRIVE_FILE', gdFileId: '../../etc' }] },
            { letterId: LETTER_ID, files: [LETTER_ONLY[0], LETTER_ONLY[0]] },
        ]) {
            expect((await rejected(kit.controller.createJob(PERSON_ID, body))).status).toBe(400);
        }
        expect(kit.repo.jobs).toHaveLength(0);
    });

    it('pismo spoza zakresu osoby nie zaklada zlecenia', async () => {
        kit.rejectScope.value = true;

        const error: any = await kit.controller
            .createJob(PERSON_ID, { letterId: LETTER_ID, files: LETTER_ONLY }, { projectOurIds: ['X'] })
            .catch((e) => e);

        expect(error.status).toBe(403);
        expect(kit.repo.jobs).toHaveLength(0);
    });
});

describe('trasy sesyjne: cudze zlecenie', () => {
    it('obca osoba nie zobaczy stanu, podgladu ani nie anuluje (403), a zlecenie zostaje nietkniete', async () => {
        const job = await prepareJob();
        const stranger = 999;

        for (const call of [
            () => kit.controller.getJobStatus(job.jobId, stranger),
            () => kit.controller.getPreview(job.jobId, stranger, 0),
            () => kit.controller.cancelOwnJob(job.jobId, stranger, 'x'),
            () => kit.controller.getJobStatus(424242, PERSON_ID), // nieistniejace wyglada tak samo
        ]) {
            expect((await rejected(call())).status).toBe(403);
        }
        expect(kit.repo.jobs[0].status).toBe('prepared');
    });

    it('wlasciciel widzi stan z kodem kontrolnym i moze obejrzec zamrozony PDF', async () => {
        const job = await prepareJob(LETTER_AND_ATTACHMENTS);

        const status = await kit.controller.getJobStatus(job.jobId, PERSON_ID);
        const preview = await kit.controller.getPreview(job.jobId, PERSON_ID, 0);

        expect(status.status).toBe('prepared');
        expect(status.signer?.name).toBe('Żaneta Gęślarz-Łoś');
        expect(status.files.map((f) => f.checkCode)).toEqual(job.prepared.files.map((f) => f.checkCode));
        expect(status.files.every((f) => f.previewAvailable && f.pages === 1)).toBe(true);
        expect(preview.bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(preview.fileName).toBe('Pismo testowe_podglad.pdf');
    });
});

describe('szczesliwa sciezka: od zlecenia do podpisanych plikow na Dysku', () => {
    it('program dostaje hash z kodem kontrolnym, serwer sklada, sprawdza i zapisuje wszystkie pliki obok zrodla', async () => {
        const job = await prepareJob(LETTER_AND_ATTACHMENTS);

        // kontrakt z programem: 64 znaki hex, kod = pierwsze 8 znakow wielkimi literami jako XXXX-XXXX
        for (const f of job.prepared.files) {
            expect(f.hashToSign).toMatch(/^[0-9a-f]{64}$/);
            const code = f.hashToSign.slice(0, 8).toUpperCase();
            expect(f.checkCode).toBe(`${code.slice(0, 4)}-${code.slice(4)}`);
            expect(f.pages).toBe(1);
        }
        expect(job.prepared.files.map((f) => f.name)).toEqual(['Pismo testowe', 'Zalacznik 1.pdf', 'Notatka']);
        // do tej pory ZERO zapisow na Dysku (tylko odczyt)
        expect(kit.drive.writes).toEqual([]);

        const result = await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));

        expect(result).toEqual({ status: 'done' });
        expect(kit.drive.writes.map((w) => [w.op, w.name, w.parent])).toEqual([
            ['upload', 'Pismo testowe_pdp.pdf', LETTER_FOLDER_ID],
            ['upload', 'Zalacznik 1_pdp.pdf', LETTER_FOLDER_ID],
            ['upload', 'Notatka_pdp.pdf', LETTER_FOLDER_ID],
        ]);
        // zapisane pliki to naprawde poprawnie podpisane PDF-y tym certyfikatem
        for (const write of kit.drive.writes) {
            const bytes = kit.drive.files.get(write.id)!.bytes!;
            const check = validate(bytes);
            expect(check).toMatchObject({ valid: true, byteRangeCoversFile: true, signerName: 'Żaneta Gęślarz-Łoś' });
            expect(check.certSerial).toBe(identity.serialHex);
            expect(verifySigningCertificate(check.chainDer, { allowlist: identity.allowlist }).subjectCn).toBe(
                'Żaneta Gęślarz-Łoś'
            );
        }
        // rejestr podpisow
        expect(kit.repo.signatures.map((s) => [s.sourceType, s.method, s.certSubjectCn, s.signerPersonId, s.jobId])).toEqual([
            ['LETTER', 'LOCAL_APP', 'Żaneta Gęślarz-Łoś', PERSON_ID, job.jobId],
            ['LETTER_ATTACHMENT', 'LOCAL_APP', 'Żaneta Gęślarz-Łoś', PERSON_ID, job.jobId],
            ['LETTER_ATTACHMENT', 'LOCAL_APP', 'Żaneta Gęślarz-Łoś', PERSON_ID, job.jobId],
        ]);
        expect(kit.repo.signatures[0]).toMatchObject({
            sourceGdFileId: 'LETTER_DOC_ID_0001',
            letterId: LETTER_ID,
            certSerial: identity.serialHex,
            certIssuer: 'Test Kwalifikowany CA',
        });
        // pierwszy certyfikat osoby zapamietany, zamrozone dane wyczyszczone
        expect(kit.repo.personCerts.get(PERSON_ID)?.certSerial).toBe(identity.serialHex);
        expect(kit.repo.jobs[0].certChain).toBeNull();
        expect((await kit.repo.listFiles(job.jobId, true)).every((f) => f.preparedPdf === null && f.signedAttrsDer === null)).toBe(true);
        // strona PS widzi 'done' i linki do podpisanych plikow
        const status = await kit.controller.getJobStatus(job.jobId, PERSON_ID);
        expect(status.status).toBe('done');
        expect(status.certChangedWarning).toBe(false);
        expect(status.files.map((f) => f.signedName)).toEqual([
            'Pismo testowe_pdp.pdf',
            'Zalacznik 1_pdp.pdf',
            'Notatka_pdp.pdf',
        ]);
        expect(status.files[0].signedUrl).toMatch(/^https:\/\/drive\.google\.com\/file\/d\/UPLOADED_1_/);
    });

    it('program widzi liste plikow, wersje minimalna i termin; stan koncowy jest rozpoznawalny', async () => {
        const job = await startJob(LETTER_AND_ATTACHMENTS);

        const view = await kit.controller.getJobForProgram(job.token);

        expect(view).toEqual({
            status: 'created',
            files: [{ name: 'Pismo testowe' }, { name: 'Zalacznik 1.pdf' }, { name: 'Notatka' }],
            minProgramVersion: '1.0.0',
            expiresAt: job.expiresAt,
        });
    });

    it('powtorny podpis tego samego pisma dostaje znacznik czasu zamiast nadpisywac (D-SIG-4)', async () => {
        const first = await prepareJob();
        await kit.controller.submitSignatures(first.token, cardSignatures(first.prepared));
        kit.clock.now = new Date('2026-10-10T08:05:09Z'); // 10:05:09 w Warszawie (CEST, UTC+2)
        const second = await prepareJob();
        await kit.controller.submitSignatures(second.token, cardSignatures(second.prepared));

        expect(kit.drive.writes.map((w) => w.name)).toEqual([
            'Pismo testowe_pdp.pdf',
            'Pismo testowe_pdp_20261010-100509.pdf',
        ]);
    });

    it('zmiana certyfikatu osoby daje ostrzezenie, ale nie blokuje', async () => {
        const renewed = await makeIdentity({ commonName: 'Żaneta Gęślarz-Łoś' });
        kit = await makeKit([...identity.allowlist, ...renewed.allowlist]);
        const first = await prepareJob();
        await kit.controller.submitSignatures(first.token, cardSignatures(first.prepared));

        const second = await prepareJob(LETTER_ONLY, renewed);
        const status = await kit.controller.getJobStatus(second.jobId, PERSON_ID);

        expect(status.status).toBe('prepared');
        expect(status.certChangedWarning).toBe(true);
        expect((await kit.controller.getJobStatus(first.jobId, PERSON_ID)).certChangedWarning).toBe(false);
        // pierwszy zapamietany certyfikat nie jest nadpisywany
        expect(kit.repo.personCerts.get(PERSON_ID)?.certSerial).toBe(identity.serialHex);
    });
});

describe('odmowy przed jakimkolwiek zapisem na Dysku', () => {
    const noWrites = () => expect(kit.drive.writes).toEqual([]);

    it('token nieznany lub w zlym formacie: 404 na wszystkich czterech trasach', async () => {
        const unknown = randomBytes(32).toString('base64url');

        for (const token of [unknown, 'krotki', '../../etc/passwd', undefined]) {
            expect((await rejected(kit.controller.getJobForProgram(token))).status).toBe(404);
            expect((await rejected(kit.controller.submitCertificate(token, certBody()))).status).toBe(404);
            expect((await rejected(kit.controller.submitSignatures(token, { signatures: [] }))).status).toBe(404);
            expect((await rejected(kit.controller.cancelByProgram(token, {}))).status).toBe(404);
        }
        noWrites();
    });

    it('token po terminie: stan expired, certyfikat i podpisy odrzucone (410), zamrozone dane wyczyszczone', async () => {
        const job = await prepareJob();
        kit.clock.now = new Date(kit.clock.now.getTime() + JOB_TTL_MS + 1000);

        const view = await kit.controller.getJobForProgram(job.token);
        const afterCert = await rejected(kit.controller.submitCertificate(job.token, certBody()));
        const afterSig = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(view.status).toBe('expired');
        expect(afterCert.status).toBe(410);
        expect(afterSig.status).toBe(410);
        expect(afterSig.code).toBe('EXPIRED');
        expect((await kit.repo.listFiles(job.jobId, true)).every((f) => f.preparedPdf === null)).toBe(true);
        noWrites();
    });

    it('zlecenie po terminie, ktorego nikt nie dotknal, wygasza oportunistycznie kolejne zakladane zlecenie', async () => {
        const stale = await startJob();
        kit.clock.now = new Date(kit.clock.now.getTime() + JOB_TTL_MS + 1000);

        await startJob();

        expect(kit.repo.jobs.find((j) => j.id === stale.jobId)?.status).toBe('expired');
    });

    it('token uzyty ponownie: drugi certyfikat i drugi komplet podpisow sa odrzucone (409)', async () => {
        const job = await prepareJob();

        const secondCert = await rejected(kit.controller.submitCertificate(job.token, certBody()));
        expect(secondCert.status).toBe(409);
        expect(secondCert.code).toBe('WRONG_STATE');
        noWrites();

        await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));
        const writesAfterFirst = kit.drive.writes.length;
        const secondSig = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));
        const thirdCert = await rejected(kit.controller.submitCertificate(job.token, certBody()));

        expect(secondSig.status).toBe(409);
        expect(thirdCert.status).toBe(409);
        expect(kit.drive.writes).toHaveLength(writesAfterFirst);
        expect(kit.repo.signatures).toHaveLength(1);
    });

    it('rownolegle certyfikaty: dokladnie jeden wygrywa, drugi dostaje 409', async () => {
        const job = await startJob();

        const results = await Promise.allSettled([
            kit.controller.submitCertificate(job.token, certBody()),
            kit.controller.submitCertificate(job.token, certBody()),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(loser.reason.status).toBe(409);
        noWrites();
    });

    it('podpisy przed krokiem certyfikatu oraz po anulowaniu sa odrzucone', async () => {
        const job = await startJob();

        expect((await rejected(kit.controller.submitSignatures(job.token, { signatures: [] }))).status).toBe(409);
        await kit.controller.cancelByProgram(job.token, { reason: 'Uzytkownik zamknal okno' });
        expect((await rejected(kit.controller.submitCertificate(job.token, certBody()))).status).toBe(409);

        expect(kit.repo.jobs[0]).toMatchObject({ status: 'cancelled', cancelReason: 'Uzytkownik zamknal okno' });
        noWrites();
    });

    it.each([
        ['samopodpisany', { selfSigned: true }, /Brak certyfikatów urzędu/],
        ['bez uzycia niezaprzeczalnosc', { nonRepudiation: false }, /niezaprzeczalność/],
        ['bez QcStatements', { qcStatements: false }, /QcStatements/],
    ])('certyfikat %s: 422 w kroku certyfikatu, zlecenie wraca do wyboru innego, Dysk nietkniety', async (_label, options, message) => {
        const bad = await makeIdentity(options);
        // CA tej tozsamosci JEST na liscie zaufanych, wiec odmowa wynika z samego certyfikatu, nie z CA
        kit = await makeKit([...identity.allowlist, ...bad.allowlist]);
        const job = await startJob();
        const readsBefore = kit.drive.reads.length;

        const error = await rejected(kit.controller.submitCertificate(job.token, certBody(bad)));

        expect(error.status).toBe(422);
        expect(error.code).toBe('CERTIFICATE_REJECTED');
        expect(error.message).toMatch(message);
        expect(kit.repo.jobs[0].status).toBe('created');
        expect(kit.drive.reads).toHaveLength(readsBefore); // nic nawet nie pobrano
        noWrites();
        // po odrzuceniu mozna jeszcze podac wlasciwy certyfikat
        await expect(kit.controller.submitCertificate(job.token, certBody())).resolves.toBeDefined();
    });

    it('certyfikat z CA spoza listy zaufanych: 422', async () => {
        const stranger = await makeIdentity();
        const job = await startJob();

        const error = await rejected(kit.controller.submitCertificate(job.token, certBody(stranger)));

        expect(error.status).toBe(422);
        expect(error.message).toMatch(/zaufanego urzędu/);
        noWrites();
    });

    it('certyfikat inny niz w kroku certyfikatu (podpis kluczem innej karty): odrzucony, zlecenie failed', async () => {
        const job = await prepareJob();
        const other = await makeIdentity({ commonName: 'Ktoś Inny' });

        const error = await rejected(
            kit.controller.submitSignatures(job.token, cardSignatures(job.prepared, other))
        );

        expect(error.status).toBe(422);
        expect(error.code).toBe('SIGNATURE_REJECTED');
        expect(kit.repo.jobs[0].status).toBe('failed');
        expect(kit.repo.signatures).toHaveLength(0);
        noWrites();
    });

    it('bledne bajty podpisu, podpis innego skrotu i zla liczba podpisow: odrzucone', async () => {
        const job = await prepareJob(LETTER_AND_ATTACHMENTS);

        // zla liczba / indeksy: 400, zlecenie nadal mozna dokonczyc
        for (const body of [
            { signatures: [] },
            { signatures: [{ index: 0, signature: b64(randomBytes(256)) }] },
            {
                signatures: [0, 0, 1].map((index) => ({ index, signature: b64(randomBytes(256)) })),
            },
        ]) {
            expect((await rejected(kit.controller.submitSignatures(job.token, body))).status).toBe(400);
        }
        expect(kit.repo.jobs[0].status).toBe('prepared');

        // smieciowe bajty zamiast podpisu: 422 i koniec zlecenia
        const garbage = {
            signatures: job.prepared.files.map((_f, index) => ({ index, signature: b64(randomBytes(256)) })),
        };
        const error = await rejected(kit.controller.submitSignatures(job.token, garbage));

        expect(error.status).toBe(422);
        expect(kit.repo.jobs[0].status).toBe('failed');
        noWrites();
    });

    it('podpis cudzego skrotu (plik 0 podpisany skrotem pliku 1) jest odrzucony w calosci', async () => {
        const job = await prepareJob(LETTER_AND_ATTACHMENTS);
        const swapped = {
            signatures: [1, 0, 2].map((hashIndex, index) => ({
                index,
                signature: b64(
                    softwareCardSign(Buffer.from(job.prepared.files[hashIndex].hashToSign, 'hex'), identity.privateKey)
                ),
            })),
        };

        const error = await rejected(kit.controller.submitSignatures(job.token, swapped));

        expect(error.status).toBe(422);
        noWrites();
    });

    it('wszystko albo nic: awaria zapisu drugiego pliku wyrzuca pierwszy do kosza i nie zostawia sladu w rejestrze', async () => {
        const job = await prepareJob(LETTER_AND_ATTACHMENTS);
        kit.drive.failUploadAt = 2;

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error.status).toBe(502);
        expect(error.code).toBe('DRIVE_FAILED');
        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload', 'trash']);
        expect(kit.drive.files.get(kit.drive.writes[1].id)?.trashed).toBe(true);
        expect(kit.repo.signatures).toHaveLength(0);
        expect(kit.repo.jobs[0].status).toBe('failed');
    });

    it('wszystko albo nic: plik, ktorego nie widac w folderze po zapisie, cofa caly zapis', async () => {
        const job = await prepareJob();
        kit.drive.hideUploadedFromParent = true;

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error.code).toBe('DRIVE_FAILED');
        expect(kit.repo.signatures).toHaveLength(0);
        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload', 'trash']);
    });

    it('awaria sprzatania po zatwierdzeniu nie wyrzuca podpisanych plikow do kosza', async () => {
        const job = await prepareJob();
        kit.repo.clearSensitive = async () => {
            throw new Error('baza niedostepna');
        };

        await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));

        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload']);
        expect(kit.repo.signatures).toHaveLength(1);
        expect(kit.repo.jobs[0].status).toBe('done');
    });

    it('awaria bazy po zapisie na Dysk cofa pliki (kosz) i konczy zlecenie jako failed', async () => {
        const job = await prepareJob();
        kit.repo.failSignatureInsert = true;

        const error = await rejected(kit.controller.submitSignatures(job.token, cardSignatures(job.prepared)));

        expect(error.code).toBe('DRIVE_FAILED');
        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload', 'trash']);
        expect(kit.repo.jobs[0].status).toBe('failed');
    });

    it('plik zrodlowy usuniety z folderu po zalozeniu zlecenia: przygotowanie konczy zlecenie bledem czytelnym dla uzytkownika', async () => {
        const job = await startJob(LETTER_AND_ATTACHMENTS);
        kit.drive.files.get('ATTACHMENT_PDF_001')!.trashed = true;

        const error = await rejected(kit.controller.submitCertificate(job.token, certBody()));

        expect(error.message).toMatch(/Pliku „Zalacznik 1.pdf” nie ma już w folderze pisma/);
        expect(kit.repo.jobs[0].status).toBe('failed');
        expect(kit.repo.jobs[0].failureMessage).toBe(error.message);
        noWrites();
    });

    it('anulowanie zlecenia w trakcie podpisywania jest niemozliwe po zakonczeniu', async () => {
        const job = await prepareJob();
        await kit.controller.submitSignatures(job.token, cardSignatures(job.prepared));

        const error = await rejected(kit.controller.cancelOwnJob(job.jobId, PERSON_ID, null));

        expect(error.status).toBe(409);
        expect(kit.repo.jobs[0].status).toBe('done');
    });
});

describe('Wgraj podpisany (reczne wgranie)', () => {
    let signedPdf: Buffer;

    /** PDF podpisany "gdzie indziej" przez dowolna tozsamosc (pelna sciezka biblioteki SIG-1). */
    async function signElsewhere(id: KitIdentity, pdf?: Buffer): Promise<Buffer> {
        const { prepare, finalize } = await import('../..');
        const prepared = await prepare(pdf ?? (await makeLetterPdf('Inny')), id.chainDer, 'letterClosing');
        return finalize(
            prepared.preparedPdf,
            prepared.signedAttrsDer,
            softwareCardSign(prepared.hashToSign, id.privateKey),
            id.chainDer
        );
    }

    beforeAll(async () => {
        signedPdf = await signElsewhere(identity);
    });

    it('przyjmuje poprawnie podpisany PDF i zapisuje go jako <nazwa pisma>_pdp.pdf z metoda MANUAL_UPLOAD', async () => {
        const result = await kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: signedPdf });

        expect(result.signedName).toBe('Pismo testowe_pdp.pdf');
        expect(result.signerName).toBe('Żaneta Gęślarz-Łoś');
        expect(result.certChangedWarning).toBe(false);
        expect(kit.drive.writes.map((w) => [w.op, w.name, w.parent])).toEqual([
            ['upload', 'Pismo testowe_pdp.pdf', LETTER_FOLDER_ID],
        ]);
        expect(kit.repo.signatures).toEqual([
            expect.objectContaining({
                sourceType: 'LETTER',
                method: 'MANUAL_UPLOAD',
                sourceGdFileId: 'LETTER_DOC_ID_0001',
                signedGdFileId: result.signedGdFileId,
                certSubjectCn: 'Żaneta Gęślarz-Łoś',
                certSerial: identity.serialHex,
                signerPersonId: PERSON_ID,
                jobId: null,
                letterId: LETTER_ID,
            }),
        ]);
        expect(kit.repo.personCerts.get(PERSON_ID)?.certSerial).toBe(identity.serialHex);
    });

    it('przy kolizji nazwy dodaje znacznik czasu', async () => {
        await kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: signedPdf });
        kit.clock.now = new Date('2026-10-09T10:00:07Z'); // 12:00:07 w Warszawie

        const second = await kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: signedPdf });

        expect(second.signedName).toBe('Pismo testowe_pdp_20261009-120007.pdf');
    });

    it('odrzuca plik, ktory nie jest PDF (400/422), pusty i przekraczajacy limit', async () => {
        const notPdf = await rejected(
            kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: Buffer.from('PK\u0003\u0004 to jest docx') })
        );
        const empty = await rejected(kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: Buffer.alloc(0) }));
        const missing = await rejected(kit.controller.uploadSigned(PERSON_ID, LETTER_ID, undefined));
        const huge = await rejected(
            kit.controller.uploadSigned(PERSON_ID, LETTER_ID, {
                buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(11 * 1024 * 1024)]),
            })
        );

        expect(notPdf.status).toBe(422);
        expect(notPdf.message).toMatch(/nie jest plik/i);
        expect([empty.status, missing.status, huge.status]).toEqual([400, 400, 400]);
        expect(kit.drive.writes).toEqual([]);
    });

    it('odrzuca PDF bez podpisu', async () => {
        const error = await rejected(
            kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: await makeLetterPdf() })
        );

        expect(error.status).toBe(422);
        expect(error.message).toMatch(/nie ma podpisu/);
        expect(kit.drive.writes).toEqual([]);
    });

    it('odrzuca PDF z uszkodzonym podpisem oraz PDF zmieniony po podpisaniu', async () => {
        // zmiana bajtu w podpisanej tresci (tekst strony) -> skrot dokumentu przestaje sie zgadzac
        const tampered = Buffer.from(signedPdf);
        const at = tampered.indexOf('Stopka') >= 0 ? tampered.indexOf('Stopka') : 200;
        tampered[at] = tampered[at] ^ 0x01;
        // dopisanie bajtow po podpisie -> podpis nie obejmuje calego pliku
        const appended = Buffer.concat([signedPdf, Buffer.from('\n% dopisek po podpisie\n')]);
        // zepsucie samego CMS (zamiana cyfr hex w /Contents)
        const brokenCms = Buffer.from(signedPdf);
        const contents = brokenCms.indexOf('/Contents <');
        brokenCms.write('FF', contents + '/Contents <'.length + 40, 'latin1');

        for (const buffer of [tampered, appended, brokenCms]) {
            const error = await rejected(kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer }));
            expect(error.status).toBe(422);
            expect(error.message).toMatch(/uszkodzony|nie ma podpisu|odczytać/);
        }
        expect(kit.drive.writes).toEqual([]);
        expect(kit.repo.signatures).toHaveLength(0);
    });

    it('stosuje te same kontrole certyfikatu: samopodpisany, bez Qc, bez niezaprzeczalnosci, CA spoza listy -> odrzucone przed Dyskiem', async () => {
        const cases: Array<[Parameters<typeof makeIdentity>[0], boolean, RegExp]> = [
            [{ selfSigned: true }, true, /Brak certyfikatów urzędu/],
            [{ qcStatements: false }, true, /QcStatements/],
            [{ nonRepudiation: false }, true, /niezaprzeczalność/],
            [{}, false, /zaufanego urzędu/], // dobry certyfikat, ale CA spoza listy
        ];
        for (const [options, caTrusted, message] of cases) {
            const bad = await makeIdentity(options);
            kit = await makeKit(caTrusted ? [...identity.allowlist, ...bad.allowlist] : identity.allowlist);
            const pdf = await signElsewhere(bad);

            const error = await rejected(kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: pdf }));

            expect(error.code).toBe('CERTIFICATE_REJECTED');
            expect(error.message).toMatch(message);
            expect(kit.drive.writes).toEqual([]);
        }
    });

    it('sprawdza zakres projektu pisma przed odczytem pliku', async () => {
        kit.rejectScope.value = true;

        const error: any = await kit.controller
            .uploadSigned(PERSON_ID, LETTER_ID, { buffer: signedPdf }, { projectOurIds: [] })
            .catch((e) => e);

        expect(error.status).toBe(403);
        expect(kit.drive.reads).toEqual([]);
        expect(kit.drive.writes).toEqual([]);
    });

    it('awaria bazy po zapisie na Dysk wyrzuca plik do kosza', async () => {
        kit.repo.failSignatureInsert = true;

        const error = await rejected(kit.controller.uploadSigned(PERSON_ID, LETTER_ID, { buffer: signedPdf }));

        expect(error.code).toBe('DRIVE_FAILED');
        expect(kit.drive.writes.map((w) => w.op)).toEqual(['upload', 'trash']);
    });
});

describe('signedFileName', () => {
    it('zdejmuje .pdf, usuwa ukosniki z nazwy i rozni kolizje bez wzgledu na wielkosc liter', () => {
        const now = new Date('2026-01-15T11:00:00Z'); // zima: UTC+1
        expect(signedFileName('Umowa.PDF', new Set(), now)).toBe('Umowa_pdp.pdf');
        expect(signedFileName('A/B\\C', new Set(), now)).toBe('A-B-C_pdp.pdf');
        expect(signedFileName('Umowa', new Set(['umowa_PDP.pdf']), now)).toBe(
            'Umowa_pdp_20260115-120000.pdf'
        );
        expect(
            signedFileName('Umowa', new Set(['Umowa_pdp.pdf', 'Umowa_pdp_20260115-120000.pdf']), now)
        ).toBe('Umowa_pdp_20260115-120000_2.pdf');
    });
});

// Tylko dla sprawdzenia, ze helper sha256Hex z zestawu zgadza sie z odciskiem w produkcji.
it('sha256Hex z zestawu testowego daje wielkie litery hex', () => {
    expect(sha256Hex(Buffer.from('a'))).toBe(createHash('sha256').update('a').digest('hex').toUpperCase());
});

describe('podpisane pliki pisma (plakietka na liscie i okno podpisu)', () => {
    const signature = (over: Record<string, unknown>) => ({
        sourceType: 'LETTER' as const,
        sourceGdFileId: 'LETTER_DOC_ID_0001',
        signedGdFileId: 'SIGNED_FILE_ID_001',
        signedName: 'Pismo testowe_pdp.pdf',
        letterId: LETTER_ID,
        method: 'LOCAL_APP' as const,
        certSubjectCn: 'Żaneta Gęślarz-Łoś',
        certSerial: 'AA',
        certIssuer: 'COPE SZAFIR - Kwalifikowany',
        signerPersonId: PERSON_ID,
        jobId: null,
        signedAt: new Date('2026-10-09T10:00:00Z'),
        ...over,
    });

    it('lista pisma: najnowszy podpis pierwszy, z odnosnikiem do pliku na Dysku i nazwa podpisujacego', async () => {
        kit.repo.signatures.push(
            signature({}),
            signature({
                signedGdFileId: 'SIGNED_FILE_ID_002',
                signedName: 'Zalacznik 1_pdp.pdf',
                sourceType: 'LETTER_ATTACHMENT',
                method: 'MANUAL_UPLOAD',
                signedAt: new Date('2026-10-09T11:00:00Z'),
            })
        );

        const result = await kit.controller.listLetterSignatures(LETTER_ID);

        expect(result.letterId).toBe(LETTER_ID);
        expect(result.signatures.map((s) => s.signedName)).toEqual([
            'Zalacznik 1_pdp.pdf',
            'Pismo testowe_pdp.pdf',
        ]);
        expect(result.signatures[0]).toMatchObject({
            signedUrl: 'https://drive.google.com/file/d/SIGNED_FILE_ID_002/view',
            signerName: 'Żaneta Gęślarz-Łoś',
            method: 'MANUAL_UPLOAD',
            signedAt: '2026-10-09T11:00:00.000Z',
        });
    });

    it('lista pisma sprawdza zakres projektu i odrzuca zly identyfikator', async () => {
        const scope = { projectOurIds: ['A'] } as any;
        kit.rejectScope.value = true;

        const denied = await kit.controller
            .listLetterSignatures(LETTER_ID, scope)
            .catch((e) => e);
        expect(denied.status).toBe(403);
        expect(kit.scopeCalls).toEqual([{ letterId: LETTER_ID, scope }]);

        const bad = await rejected(kit.controller.listLetterSignatures(Number('x')));
        expect(bad.status).toBe(400);
    });

    it('zbiorczo: jedno zapytanie o wiele pism, w mapie tylko pisma z podpisami, z liczba i ostatnim podpisujacym', async () => {
        kit.repo.signatures.push(
            signature({}),
            signature({
                signedGdFileId: 'SIGNED_FILE_ID_002',
                certSubjectCn: 'Ktoś Inny',
                signedAt: new Date('2026-10-09T12:00:00Z'),
            }),
            signature({ letterId: 99, signedGdFileId: 'SIGNED_FILE_ID_003' })
        );
        const spy = jest.spyOn(kit.repo, 'listSignaturesByLetterIds');

        const result = await kit.controller.summarizeLetterSignatures({ letterIds: [LETTER_ID, 8, LETTER_ID] });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith([LETTER_ID, 8]);
        expect(Object.keys(result.summary)).toEqual([String(LETTER_ID)]);
        expect(result.summary[String(LETTER_ID)]).toMatchObject({
            count: 2,
            latestSignerName: 'Ktoś Inny',
            latestSignedAt: '2026-10-09T12:00:00.000Z',
        });
        expect(result.summary[String(LETTER_ID)].signatures).toHaveLength(2);
    });

    it('zbiorczo: pusta lista daje pusta mape, a smieci i nadmiar sa odrzucane', async () => {
        const spy = jest.spyOn(kit.repo, 'listSignaturesByLetterIds');

        expect((await kit.controller.summarizeLetterSignatures({ letterIds: [] })).summary).toEqual({});
        expect(spy).toHaveBeenCalledWith([]);
        for (const body of [undefined, {}, { letterIds: 'x' }, { letterIds: [0] }, { letterIds: [1.5] }, { letterIds: ['a'] }]) {
            expect((await rejected(kit.controller.summarizeLetterSignatures(body))).status).toBe(400);
        }
        const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
        expect((await rejected(kit.controller.summarizeLetterSignatures({ letterIds: tooMany }))).status).toBe(400);
    });

    it('zbiorczo z zakresem projektu sprawdza kazde pismo i nie czyta podpisow przy odmowie', async () => {
        const scope = { projectOurIds: ['A'] } as any;
        kit.rejectScope.value = true;
        const spy = jest.spyOn(kit.repo, 'listSignaturesByLetterIds');

        const denied = await kit.controller
            .summarizeLetterSignatures({ letterIds: [LETTER_ID, 8] }, scope)
            .catch((e) => e);

        expect(denied.status).toBe(403);
        expect(spy).not.toHaveBeenCalled();
    });
});
