import {
    KeyObject,
    createHash,
    createPrivateKey,
    generateKeyPairSync,
    randomInt,
    webcrypto,
} from 'crypto';
import fs from 'fs';
import path from 'path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { signingAssetsDir } from '../../SigningAssets';
// Import tylko dla efektu ubocznego (silnik kryptograficzny pkijs) i softwareCardSign.
import { softwareCardSign } from '../../__tests__/testPki';
import { TrustedCa } from '../QualifiedCaAllowlist';
import { DriveFileInfo, SigningDrive } from '../SigningDrive';
import SigningJobRepository, {
    JobFileRecord,
    JobRecord,
    JobStatus,
    JobUpdate,
    LetterContext,
    NewJob,
    NewJobFile,
    NewSignature,
    PersonCertificateRecord,
    SignatureRecord,
} from '../SigningJobRepository';
import SigningJobsController from '../SigningJobsController';

export { softwareCardSign };

const ab = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export const sha256Hex = (b: Buffer): string =>
    createHash('sha256').update(b).digest('hex').toUpperCase();

// ------------------------------------------------------------------ PKI

function dn(commonName: string): pkijs.RelativeDistinguishedNames {
    return new pkijs.RelativeDistinguishedNames({
        typesAndValues: [
            new pkijs.AttributeTypeAndValue({
                type: '2.5.4.6',
                value: new asn1js.PrintableString({ value: 'PL' }),
            }),
            new pkijs.AttributeTypeAndValue({
                type: '2.5.4.3',
                value: new asn1js.Utf8String({ value: commonName }),
            }),
        ],
    });
}

const ext = (oid: string, critical: boolean, value: asn1js.AsnType) =>
    new pkijs.Extension({ extnID: oid, critical, extnValue: value.toBER(false) });

interface CertSpec {
    commonName: string;
    issuerName: pkijs.RelativeDistinguishedNames;
    issuerKey: KeyObject;
    subjectKey: KeyObject;
    isCa: boolean;
    notBefore: Date;
    notAfter: Date;
    nonRepudiation?: boolean;
    qcStatements?: boolean;
    /** CA bez BasicConstraints cA=true (zly certyfikat posredni). */
    caFlagMissing?: boolean;
}

async function issue(spec: CertSpec): Promise<{ der: Buffer; name: pkijs.RelativeDistinguishedNames }> {
    const cert = new pkijs.Certificate();
    cert.version = 2;
    cert.serialNumber = new asn1js.Integer({ value: randomInt(1, 0x7fffffff) });
    cert.subject = dn(spec.commonName);
    cert.issuer = spec.issuerName;
    cert.notBefore.value = spec.notBefore;
    cert.notAfter.value = spec.notAfter;
    const spki = spec.subjectKey.export({ type: 'spki', format: 'der' }) as Buffer;
    cert.subjectPublicKeyInfo = new pkijs.PublicKeyInfo({
        schema: asn1js.fromBER(ab(spki)).result,
    });
    const extensions: pkijs.Extension[] = [
        ext(
            '2.5.29.19',
            true,
            new pkijs.BasicConstraints({
                cA: spec.isCa && !spec.caFlagMissing,
            }).toSchema()
        ),
    ];
    // KeyUsage: keyCertSign dla CA; nonRepudiation (0x40) albo tylko digitalSignature (0x80) dla osoby.
    const usage = spec.isCa ? 0x04 : spec.nonRepudiation === false ? 0x80 : 0x40;
    extensions.push(
        ext(
            '2.5.29.15',
            true,
            new asn1js.BitString({
                valueHex: new Uint8Array([usage]).buffer,
                unusedBits: spec.isCa ? 5 : spec.nonRepudiation === false ? 7 : 6,
            })
        )
    );
    if (!spec.isCa && spec.qcStatements !== false) {
        // id-pe-qcStatements; tresc (lista QCStatement) nie jest w v1 interpretowana.
        extensions.push(ext('1.3.6.1.5.5.7.1.3', false, new asn1js.Sequence({ value: [] })));
    }
    cert.extensions = extensions;
    const signingKey = await webcrypto.subtle.importKey(
        'pkcs8',
        spec.issuerKey.export({ type: 'pkcs8', format: 'der' }),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    await cert.sign(signingKey as any, 'SHA-256');
    return { der: Buffer.from(cert.toSchema(true).toBER()), name: cert.subject };
}

export interface KitIdentity {
    /** Lisc, posredni, korzen (albo sam lisc dla samopodpisanego). */
    chainDer: Buffer[];
    privateKey: KeyObject;
    serialHex: string;
    /** Lista zaufanych CA zawierajaca posredniego i korzen TEJ tozsamosci. */
    allowlist: TrustedCa[];
}

export interface IdentityOptions {
    commonName?: string;
    nonRepudiation?: boolean;
    qcStatements?: boolean;
    selfSigned?: boolean;
    notBefore?: Date;
    notAfter?: Date;
    intermediateIsNotCa?: boolean;
}

export async function makeIdentity(options: IdentityOptions = {}): Promise<KitIdentity> {
    const rsa = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
    const notBefore = options.notBefore ?? new Date('2025-01-01T00:00:00Z');
    const notAfter = options.notAfter ?? new Date('2035-01-01T00:00:00Z');
    const commonName = options.commonName ?? 'Jan Testowy';
    const leafKeys = rsa();

    if (options.selfSigned) {
        const leaf = await issue({
            commonName,
            issuerName: dn(commonName),
            issuerKey: leafKeys.privateKey,
            subjectKey: leafKeys.publicKey,
            isCa: false,
            notBefore,
            notAfter,
            nonRepudiation: options.nonRepudiation,
            qcStatements: options.qcStatements,
        });
        return {
            chainDer: [leaf.der],
            privateKey: createPrivateKey(leafKeys.privateKey.export({ type: 'pkcs8', format: 'pem' })),
            serialHex: '',
            allowlist: [],
        };
    }

    const rootKeys = rsa();
    const interKeys = rsa();
    const root = await issue({
        commonName: 'Test Root CA',
        issuerName: dn('Test Root CA'),
        issuerKey: rootKeys.privateKey,
        subjectKey: rootKeys.publicKey,
        isCa: true,
        notBefore: new Date('2020-01-01T00:00:00Z'),
        notAfter: new Date('2040-01-01T00:00:00Z'),
    });
    const inter = await issue({
        commonName: 'Test Kwalifikowany CA',
        issuerName: root.name,
        issuerKey: rootKeys.privateKey,
        subjectKey: interKeys.publicKey,
        isCa: true,
        caFlagMissing: options.intermediateIsNotCa,
        notBefore: new Date('2020-01-01T00:00:00Z'),
        notAfter: new Date('2040-01-01T00:00:00Z'),
    });
    const leaf = await issue({
        commonName,
        issuerName: inter.name,
        issuerKey: interKeys.privateKey,
        subjectKey: leafKeys.publicKey,
        isCa: false,
        notBefore,
        notAfter,
        nonRepudiation: options.nonRepudiation,
        qcStatements: options.qcStatements,
    });
    const parsed = pkijs.Certificate.fromBER(ab(leaf.der));
    return {
        chainDer: [leaf.der, inter.der, root.der],
        privateKey: createPrivateKey(leafKeys.privateKey.export({ type: 'pkcs8', format: 'pem' })),
        serialHex: Buffer.from(parsed.serialNumber.valueBlock.valueHexView)
            .toString('hex')
            .toUpperCase(),
        allowlist: [
            { sha256: sha256Hex(inter.der), label: 'test-posredni' },
            { sha256: sha256Hex(root.der), label: 'test-korzen' },
        ],
    };
}

// ------------------------------------------------------------------ PDF

/** Jednostronicowe pismo z zamknieciem „Z poważaniem” (ustawia grafike pod zamknieciem). */
export async function makeLetterPdf(title = 'Pismo testowe ENVI'): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
        fs.readFileSync(path.join(signingAssetsDir(), 'OpenSans-Regular.ttf')),
        { subset: true }
    );
    const page = doc.addPage([595, 842]);
    const lines = [
        { x: 60, y: 760, text: `${title} - nie jest to prawdziwy dokument.` },
        { x: 400, y: 400, text: 'Z poważaniem,' },
        { x: 60, y: 60, text: 'Stopka' },
    ];
    for (const line of lines)
        page.drawText(line.text, { x: line.x, y: line.y, size: 10, font, color: rgb(0, 0, 0) });
    return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function makePlainPdf(text = 'Zalacznik'): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
        fs.readFileSync(path.join(signingAssetsDir(), 'OpenSans-Regular.ttf')),
        { subset: true }
    );
    const page = doc.addPage([595, 842]);
    page.drawText(text, { x: 60, y: 760, size: 10, font });
    return Buffer.from(await doc.save({ useObjectStreams: false }));
}

// ------------------------------------------------------------------ Dysk (atrapa)

export const MIME = {
    pdf: 'application/pdf',
    doc: 'application/vnd.google-apps.document',
    sheet: 'application/vnd.google-apps.spreadsheet',
    folder: 'application/vnd.google-apps.folder',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export class FakeDrive implements SigningDrive {
    files = new Map<string, DriveFileInfo & { bytes?: Buffer }>();
    /** Wszystko, co zapisuje na Dysk. Testy odmowy twierdza: writes.length === 0. */
    writes: Array<{ op: 'upload' | 'trash'; name?: string; id: string; parent?: string }> = [];
    reads: string[] = [];
    failUploadAt: number | undefined;
    hideUploadedFromParent = false;
    private uploadCount = 0;
    private nextId = 1;

    add(info: DriveFileInfo, bytes?: Buffer): void {
        this.files.set(info.id, { ...info, bytes });
    }

    async getFile(fileId: string) {
        this.reads.push(`getFile:${fileId}`);
        const f = this.files.get(fileId);
        return f ? { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, parents: f.parents, trashed: f.trashed } : undefined;
    }

    async listFolder(folderId: string) {
        this.reads.push(`list:${folderId}`);
        return [...this.files.values()]
            .filter((f) => f.parents?.includes(folderId) && !f.trashed)
            .map(({ bytes: _bytes, ...info }) => info);
    }

    async downloadFile(fileId: string) {
        this.reads.push(`download:${fileId}`);
        const f = this.files.get(fileId);
        if (!f?.bytes) throw new Error('brak pliku');
        return f.bytes;
    }

    async exportToPdf(fileId: string) {
        this.reads.push(`export:${fileId}`);
        const f = this.files.get(fileId);
        if (!f?.bytes) throw new Error('brak pliku');
        return f.bytes;
    }

    async uploadPdf(params: { name: string; parentFolderId: string; bytes: Buffer }) {
        this.uploadCount++;
        if (this.failUploadAt === this.uploadCount) throw new Error('Dysk niedostępny');
        const id = `UPLOADED_${this.nextId++}_XXXXXXXXXXXX`;
        this.writes.push({ op: 'upload', name: params.name, id, parent: params.parentFolderId });
        this.files.set(id, {
            id,
            name: params.name,
            mimeType: MIME.pdf,
            parents: this.hideUploadedFromParent ? [] : [params.parentFolderId],
            bytes: params.bytes,
        });
        return { id };
    }

    async trashFile(fileId: string) {
        this.writes.push({ op: 'trash', id: fileId });
        const f = this.files.get(fileId);
        if (f) f.trashed = true;
    }
}

// ------------------------------------------------------------------ Repozytorium w pamieci

export class FakeRepository {
    jobs: JobRecord[] = [];
    filesByJob = new Map<number, JobFileRecord[]>();
    signatures: NewSignature[] = [];
    personCerts = new Map<number, PersonCertificateRecord>();
    letters = new Map<number, LetterContext>();
    failSignatureInsert = false;
    private nextJob = 1;
    private nextFile = 1;

    async getLetterContext(letterId: number) {
        return this.letters.get(letterId);
    }

    async insertJob(job: NewJob) {
        const id = this.nextJob++;
        this.jobs.push({
            id,
            tokenHash: job.tokenHash,
            letterId: job.letterId,
            createdByPersonId: job.createdByPersonId,
            status: 'created',
            minProgramVersion: job.minProgramVersion,
            createdAt: job.createdAt,
            expiresAt: job.expiresAt,
            preparedAt: null,
            finishedAt: null,
            cancelReason: null,
            failureMessage: null,
            certSerial: null,
            certSubjectCn: null,
            certIssuer: null,
            certChain: null,
            certChangedWarning: false,
        });
        this.filesByJob.set(id, []);
        return id;
    }

    async insertFile(jobId: number, file: NewJobFile) {
        this.filesByJob.get(jobId)!.push({
            id: this.nextFile++,
            jobId,
            fileIndex: file.fileIndex,
            sourceKind: file.sourceKind,
            sourceGdFileId: file.sourceGdFileId,
            displayName: file.displayName,
            withGraphic: file.withGraphic,
            preparedPdf: null,
            signedAttrsDer: null,
            checkCode: null,
            pages: null,
            signedGdFileId: null,
            signedName: null,
        });
    }

    private snapshot(job: JobRecord): JobRecord {
        return { ...job, certChain: job.certChain ? [...job.certChain] : null };
    }

    async findJobById(id: number) {
        const job = this.jobs.find((j) => j.id === id);
        return job ? this.snapshot(job) : undefined;
    }

    async findJobByTokenHash(hash: string) {
        const job = this.jobs.find((j) => j.tokenHash === hash);
        return job ? this.snapshot(job) : undefined;
    }

    async listFiles(jobId: number, withBlobs: boolean) {
        return (this.filesByJob.get(jobId) ?? [])
            .slice()
            .sort((a, b) => a.fileIndex - b.fileIndex)
            .map((f) => ({
                ...f,
                preparedPdf: withBlobs ? f.preparedPdf : null,
                signedAttrsDer: withBlobs ? f.signedAttrsDer : null,
            }));
    }

    async findFile(jobId: number, fileIndex: number) {
        return (this.filesByJob.get(jobId) ?? []).find((f) => f.fileIndex === fileIndex);
    }

    async transition(jobId: number, from: JobStatus[], to: JobStatus, update: JobUpdate = {}) {
        // Bez await miedzy odczytem a zapisem: to samo, co atomowy UPDATE ... WHERE w bazie.
        const job = this.jobs.find((j) => j.id === jobId);
        if (!job || !from.includes(job.status)) return false;
        job.status = to;
        Object.assign(job, update);
        return true;
    }

    async saveFilePrepared(
        fileId: number,
        data: { preparedPdf: Buffer; signedAttrsDer: Buffer; checkCode: string; pages: number }
    ) {
        for (const files of this.filesByJob.values()) {
            const f = files.find((x) => x.id === fileId);
            if (f) Object.assign(f, data);
        }
    }

    async saveFileSigned(fileId: number, signedGdFileId: string, signedName: string) {
        for (const files of this.filesByJob.values()) {
            const f = files.find((x) => x.id === fileId);
            if (f) Object.assign(f, { signedGdFileId, signedName });
        }
    }

    async clearSensitive(jobId: number) {
        for (const f of this.filesByJob.get(jobId) ?? []) {
            f.preparedPdf = null;
            f.signedAttrsDer = null;
        }
        const job = this.jobs.find((j) => j.id === jobId);
        if (job) job.certChain = null;
    }

    async expireOverdue(now: Date) {
        let n = 0;
        for (const job of this.jobs) {
            if (['created', 'preparing', 'prepared'].includes(job.status) && job.expiresAt < now) {
                job.status = 'expired';
                job.finishedAt = now;
                n++;
            }
        }
        return n;
    }

    async insertSignature(signature: NewSignature) {
        if (this.failSignatureInsert) throw new Error('baza niedostępna');
        this.signatures.push(signature);
        return this.signatures.length;
    }

    async listSignaturesByLetterIds(letterIds: number[]): Promise<SignatureRecord[]> {
        // Jak w bazie: od najnowszego podpisu; Id = kolejnosc zapisu.
        return this.signatures
            .map((s, i) => ({ s, id: i + 1 }))
            .filter(({ s }) => s.letterId !== null && letterIds.includes(s.letterId))
            .map(({ s, id }) => ({
                id,
                letterId: s.letterId as number,
                sourceType: s.sourceType,
                signedGdFileId: s.signedGdFileId,
                signedName: s.signedName,
                method: s.method,
                certSubjectCn: s.certSubjectCn,
                signedAt: s.signedAt,
            }))
            .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime() || b.id - a.id);
    }

    async findPersonCertificate(personId: number) {
        return this.personCerts.get(personId);
    }

    async rememberPersonCertificate(data: {
        personId: number;
        certSerial: string;
        certIssuerSha256: string;
    }) {
        if (!this.personCerts.has(data.personId))
            this.personCerts.set(data.personId, {
                personId: data.personId,
                certSerial: data.certSerial,
                certIssuerSha256: data.certIssuerSha256,
            });
    }
}

// ------------------------------------------------------------------ zestaw testowy

export const LETTER_ID = 7;
export const LETTER_DOC_ID = 'LETTER_DOC_ID_0001';
export const LETTER_FOLDER_ID = 'LETTER_FOLDER_ID_0001';
export const PERSON_ID = 125;

export interface Kit {
    drive: FakeDrive;
    repo: FakeRepository;
    controller: SigningJobsController;
    clock: { now: Date };
    scopeCalls: Array<{ letterId: number; scope: unknown }>;
    rejectScope: { value: boolean };
}

export async function makeKit(allowlist: TrustedCa[]): Promise<Kit> {
    const drive = new FakeDrive();
    const repo = new FakeRepository();
    const clock = { now: new Date('2026-10-09T10:00:00Z') };
    const scopeCalls: Kit['scopeCalls'] = [];
    const rejectScope = { value: false };

    repo.letters.set(LETTER_ID, {
        id: LETTER_ID,
        number: 'ENVI/7/2026',
        isOur: true,
        gdDocumentId: LETTER_DOC_ID,
        gdFolderId: LETTER_FOLDER_ID,
    });
    const letterPdf = await makeLetterPdf();
    drive.add(
        { id: LETTER_DOC_ID, name: 'Pismo testowe', mimeType: MIME.doc, parents: [LETTER_FOLDER_ID] },
        letterPdf
    );
    // Eksport PDF samego pisma i wczesniej podpisany plik: maja byc pomijane na liscie.
    drive.add(
        { id: 'EXPORT_PDF_ID_0001', name: 'Pismo testowe.pdf', mimeType: MIME.pdf, parents: [LETTER_FOLDER_ID] },
        letterPdf
    );
    drive.add(
        { id: 'OLD_SIGNED_ID_0001', name: 'Umowa_podpisany.pdf', mimeType: MIME.pdf, parents: [LETTER_FOLDER_ID] },
        letterPdf
    );
    drive.add(
        { id: 'ATTACHMENT_PDF_001', name: 'Zalacznik 1.pdf', mimeType: MIME.pdf, size: 1000, parents: [LETTER_FOLDER_ID] },
        await makePlainPdf('Zalacznik 1')
    );
    drive.add(
        { id: 'ATTACHMENT_DOC_001', name: 'Notatka', mimeType: MIME.doc, parents: [LETTER_FOLDER_ID] },
        await makePlainPdf('Notatka')
    );
    drive.add(
        { id: 'ATTACHMENT_DOCX_01', name: 'Umowa.docx', mimeType: MIME.docx, size: 5000, parents: [LETTER_FOLDER_ID] }
    );
    drive.add({ id: 'SUBFOLDER_ID_00001', name: 'Podfolder', mimeType: MIME.folder, parents: [LETTER_FOLDER_ID] });

    const controller = new SigningJobsController({
        repository: repo as unknown as SigningJobRepository,
        drive,
        now: () => clock.now,
        runInTransaction: (cb) => cb(undefined as any),
        assertLetterInScope: async (letterId, scope) => {
            scopeCalls.push({ letterId, scope });
            if (rejectScope.value)
                throw Object.assign(new Error('Brak uprawnień do tego zasobu (pismo).'), {
                    status: 403,
                });
        },
        allowlist,
    });
    return { drive, repo, controller, clock, scopeCalls, rejectScope };
}

export const tokenOf = (protocolUrl: string): string => protocolUrl.replace('envi-podpis://job/', '');

export const b64 = (b: Buffer): string => b.toString('base64');
