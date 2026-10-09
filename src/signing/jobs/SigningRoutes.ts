import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { signingAssetsDir } from '../SigningAssets';
import SigningJobsController from './SigningJobsController';
import SigningJobValidator from './SigningJobValidator';
import { SigningJobError } from './SigningJobError';
import { MAX_UPLOAD_BYTES } from './SigningJobsConfig';

/**
 * Trasy zlecen podpisu (SIG-2). Dwa rodzaje, ktorych nie wolno mylic:
 *
 * A. Trasy SESYJNE (strona PS) - za bramka sesji i allowlista rol zakresowych; kazda sprawdza
 *    zakres projektu pisma i to, ze zlecenie nalezy do zalogowanej osoby:
 *      GET  /letter/:id/signableFiles
 *      POST /signingJob                       { letterId, files:[{kind, gdFileId?, withGraphic}] }
 *      GET  /signingJob/:id                   (odpytywanie stanu)
 *      GET  /signingJob/:id/file/:index/preview
 *      POST /signingJob/:id/cancel            { reason? }
 *      POST /letter/:id/signedPdf             (multipart, pole "file") - "Wgraj podpisany"
 *      GET  /letter/:id/signatures            podpisane pliki pisma (okno podpisu, plakietka)
 *      POST /letters/signatureSummary         { letterIds } - plakietki calej listy pism jednym zapytaniem
 *      GET  /signing/program/download         instalator ENVI Podpis (assets/signing/EnviPodpis.exe)
 *      GET  /signing/program/info             { available, version } - wersja tego instalatora
 *
 * B. Trasy PROGRAMU ENVI Podpis - BEZ sesji (wyjatek w requireSession). Jedynym poswiadczeniem
 *    jest token w adresie; kontrakt z programem: desktop/envi-podpis/src/ApiClient.cs.
 *      GET  /signing/jobs/:token
 *      POST /signing/jobs/:token/certificate  { chain:[base64 DER, lisc pierwszy] }
 *      POST /signing/jobs/:token/signatures   { signatures:[{index, signature}] }
 *      POST /signing/jobs/:token/cancel       { reason }
 *
 * Logika jest w SigningJobsController; trasa tylko tlumaczy HTTP.
 */
export interface RouteApp {
    get(path: string, ...handlers: any[]): unknown;
    post(path: string, ...handlers: any[]): unknown;
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const forbidden = () =>
    new SigningJobError('FORBIDDEN', 'Brak uprawnień do podpisywania.', 403);

/** Zwraca osobe z sesji. Tozsamosc maszynowa (token agenta) nie podpisuje: karta jest czlowieka. */
function requirePerson(req: Request, res: Response): number {
    const userData = req.session?.userData;
    if (!userData) {
        throw new SigningJobError('FORBIDDEN', 'Użytkownik niezalogowany', 401);
    }
    if (res.locals?.authenticatedMachine === true) throw forbidden();
    return userData.enviId;
}

function wrap(handler: Handler): Handler {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            next(error);
        }
    };
}

/** Nazwa pliku instalatora w assets/signing oraz nazwa, pod jaka go pobiera uzytkownik. */
export const PROGRAM_EXE_NAME = 'EnviPodpis.exe';

/** Sygnatura VS_FIXEDFILEINFO (0xFEEF04BD) zapisana little-endian. */
const VS_FIXEDFILEINFO_SIGNATURE = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);

/**
 * Wersja pliku PE z zasobu VS_FIXEDFILEINFO: dwFileVersionMS spod sygnatury +8, LS +12.
 * Zwraca trzy czesci ("1.0.0"), czwarta jest pomijana. Brak sygnatury lub obciety bufor = null.
 */
export function readProgramFileVersion(exe: Buffer): string | null {
    const at = exe.indexOf(VS_FIXEDFILEINFO_SIGNATURE);
    if (at < 0 || at + 16 > exe.length) return null;
    const ms = exe.readUInt32LE(at + 8);
    const ls = exe.readUInt32LE(at + 12);
    return `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}`;
}

export interface SigningRoutesOptions {
    /** Tylko testy: inny plik instalatora niz assets/signing/EnviPodpis.exe. */
    programExePath?: string;
}

export function registerSigningRoutes(
    app: RouteApp,
    controller: SigningJobsController,
    options: SigningRoutesOptions = {}
): void {
    const programExePath =
        options.programExePath ?? path.join(signingAssetsDir(), PROGRAM_EXE_NAME);
    const uploadMiddleware = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }).single('file');

    // ---------------------------------------------------------------- A. sesja

    app.get(
        '/letter/:id/signableFiles',
        wrap(async (req, res) => {
            requirePerson(req, res);
            res.send(
                await controller.listSignableFiles(Number(req.params.id), req.projectScope)
            );
        })
    );

    app.post(
        '/signingJob',
        wrap(async (req, res) => {
            const personId = requirePerson(req, res);
            res.send(await controller.createJob(personId, req.body, req.projectScope));
        })
    );

    app.get(
        '/signingJob/:id',
        wrap(async (req, res) => {
            const personId = requirePerson(req, res);
            res.send(await controller.getJobStatus(Number(req.params.id), personId));
        })
    );

    app.get(
        '/signingJob/:id/file/:index/preview',
        wrap(async (req, res) => {
            const personId = requirePerson(req, res);
            const { bytes, fileName } = await controller.getPreview(
                Number(req.params.id),
                personId,
                SigningJobValidator.parseFileIndex(req.params.index)
            );
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
            );
            res.setHeader('Cache-Control', 'no-store');
            res.send(bytes);
        })
    );

    app.post(
        '/signingJob/:id/cancel',
        wrap(async (req, res) => {
            const personId = requirePerson(req, res);
            res.send(
                await controller.cancelOwnJob(
                    Number(req.params.id),
                    personId,
                    SigningJobValidator.parseCancelReason(req.body)
                )
            );
        })
    );

    app.post(
        '/letter/:id/signedPdf',
        (req: Request, res: Response, next: NextFunction) => {
            // Autoryzacja przed odczytem pliku, zeby anonim nie zmuszal serwera do buforowania.
            try {
                requirePerson(req, res);
            } catch (error) {
                return next(error);
            }
            uploadMiddleware(req, res, (error: unknown) => {
                if (!error) return next();
                if ((error as any)?.code === 'LIMIT_FILE_SIZE')
                    return next(
                        new SigningJobError(
                            'BAD_REQUEST',
                            'Plik jest za duży (limit 10 MB).',
                            400
                        )
                    );
                next(error);
            });
        },
        wrap(async (req, res) => {
            const personId = requirePerson(req, res);
            res.send(
                await controller.uploadSigned(
                    personId,
                    Number(req.params.id),
                    req.file,
                    req.projectScope
                )
            );
        })
    );

    app.get(
        '/letter/:id/signatures',
        wrap(async (req, res) => {
            requirePerson(req, res);
            res.send(
                await controller.listLetterSignatures(Number(req.params.id), req.projectScope)
            );
        })
    );

    app.post(
        '/letters/signatureSummary',
        wrap(async (req, res) => {
            requirePerson(req, res);
            res.send(await controller.summarizeLetterSignatures(req.body, req.projectScope));
        })
    );

    app.get(
        '/signing/program/download',
        wrap(async (req, res) => {
            requirePerson(req, res);
            if (!fs.existsSync(programExePath))
                throw new SigningJobError(
                    'NOT_FOUND',
                    'Instalator programu ENVI Podpis nie jest teraz dostępny. Zgłoś to administratorowi.',
                    404
                );
            const bytes = fs.readFileSync(programExePath);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${PROGRAM_EXE_NAME}"`
            );
            res.setHeader('Cache-Control', 'no-cache');
            res.send(bytes);
        })
    );

    app.get(
        '/signing/program/info',
        wrap(async (req, res) => {
            requirePerson(req, res);
            res.setHeader('Cache-Control', 'no-cache');
            if (!fs.existsSync(programExePath)) {
                res.send({ available: false, version: null });
                return;
            }
            res.send({
                available: true,
                version: readProgramFileVersion(fs.readFileSync(programExePath)),
            });
        })
    );

    // ---------------------------------------------------------------- B. program (token)

    app.get(
        '/signing/jobs/:token',
        wrap(async (req, res) => {
            res.setHeader('Cache-Control', 'no-store');
            res.send(await controller.getJobForProgram(req.params.token));
        })
    );

    app.post(
        '/signing/jobs/:token/certificate',
        wrap(async (req, res) => {
            res.setHeader('Cache-Control', 'no-store');
            res.send(await controller.submitCertificate(req.params.token, req.body));
        })
    );

    app.post(
        '/signing/jobs/:token/signatures',
        wrap(async (req, res) => {
            res.setHeader('Cache-Control', 'no-store');
            res.send(await controller.submitSignatures(req.params.token, req.body));
        })
    );

    app.post(
        '/signing/jobs/:token/cancel',
        wrap(async (req, res) => {
            res.setHeader('Cache-Control', 'no-store');
            res.send(await controller.cancelByProgram(req.params.token, req.body));
        })
    );
}
