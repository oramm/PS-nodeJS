import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerSigningRoutes } from '../SigningRoutes';
import { SigningJobError } from '../SigningJobError';

type Handler = (req: any, res: any, next: any) => Promise<void> | void;

/** Zbiera trasy zarejestrowane na "aplikacji"; ostatni handler trasy to wlasciwa logika. */
function collect(controller: any, options?: { programExePath?: string }) {
    const routes: Record<string, Handler[]> = {};
    const app = {
        get: (path: string, ...handlers: Handler[]) => void (routes[`GET ${path}`] = handlers),
        post: (path: string, ...handlers: Handler[]) => void (routes[`POST ${path}`] = handlers),
    };
    registerSigningRoutes(app, controller, options);
    return routes;
}

function makeRes(locals: any = {}) {
    const res: any = { locals, headers: {} as Record<string, string>, body: undefined };
    res.setHeader = (k: string, v: string) => void (res.headers[k] = v);
    res.send = (b: any) => {
        res.body = b;
        return res;
    };
    return res;
}

async function call(handlers: Handler[], req: any, res: any) {
    const next = jest.fn();
    await handlers[handlers.length - 1](req, res, next);
    return next;
}

const PERSON = { enviId: 125, userName: 'Marek' };

describe('SigningRoutes', () => {
    let controller: any;
    let routes: Record<string, Handler[]>;

    beforeEach(() => {
        controller = {
            listSignableFiles: jest.fn().mockResolvedValue({ files: [] }),
            createJob: jest.fn().mockResolvedValue({ jobId: 1 }),
            getJobStatus: jest.fn().mockResolvedValue({ status: 'created' }),
            getPreview: jest.fn().mockResolvedValue({ bytes: Buffer.from('%PDF-x'), fileName: 'Żółć.pdf' }),
            cancelOwnJob: jest.fn().mockResolvedValue({ status: 'cancelled' }),
            uploadSigned: jest.fn().mockResolvedValue({ signedName: 'x' }),
            listLetterSignatures: jest.fn().mockResolvedValue({ letterId: 7, signatures: [] }),
            summarizeLetterSignatures: jest.fn().mockResolvedValue({ summary: {} }),
            getJobForProgram: jest.fn().mockResolvedValue({ status: 'created' }),
            submitCertificate: jest.fn().mockResolvedValue({ files: [] }),
            submitSignatures: jest.fn().mockResolvedValue({ status: 'done' }),
            cancelByProgram: jest.fn().mockResolvedValue({ status: 'cancelled' }),
        };
        routes = collect(controller);
    });

    const SESSION_ROUTES = [
        'GET /letter/:id/signableFiles',
        'POST /signingJob',
        'GET /signingJob/:id',
        'GET /signingJob/:id/file/:index/preview',
        'POST /signingJob/:id/cancel',
        'POST /letter/:id/signedPdf',
        'GET /letter/:id/signatures',
        'POST /letters/signatureSummary',
        'GET /signing/program/download',
    ];
    const PROGRAM_ROUTES = [
        'GET /signing/jobs/:token',
        'POST /signing/jobs/:token/certificate',
        'POST /signing/jobs/:token/signatures',
        'POST /signing/jobs/:token/cancel',
    ];

    it('rejestruje dokladnie komplet tras sesyjnych i cztery trasy programu', () => {
        expect(Object.keys(routes).sort()).toEqual([...SESSION_ROUTES, ...PROGRAM_ROUTES].sort());
    });

    it.each(SESSION_ROUTES)('%s: bez sesji 401, z tozsamoscia maszynowa (agent) 403, kontroler nietkniety', async (key) => {
        const params = { id: '5', index: '0' };

        const anonymous = await call(routes[key], { params, body: {}, session: {} }, makeRes());
        const machine = await call(
            routes[key],
            { params, body: {}, session: { userData: PERSON } },
            makeRes({ authenticatedMachine: true })
        );

        expect(anonymous.mock.calls[0][0]).toBeInstanceOf(SigningJobError);
        expect(anonymous.mock.calls[0][0].status).toBe(401);
        expect(machine.mock.calls[0][0].status).toBe(403);
        for (const fn of Object.values(controller) as jest.Mock[]) expect(fn).not.toHaveBeenCalled();
    });

    it('trasa sesyjna przekazuje osobe z sesji, zakres projektow i id z adresu', async () => {
        const scope = { projectOurIds: ['A'] };
        const res = makeRes();

        await call(routes['POST /signingJob'], { body: { letterId: 7 }, session: { userData: PERSON }, projectScope: scope }, res);
        await call(routes['GET /letter/:id/signableFiles'], { params: { id: '7' }, session: { userData: PERSON }, projectScope: scope }, makeRes());

        expect(controller.createJob).toHaveBeenCalledWith(125, { letterId: 7 }, scope);
        expect(controller.listSignableFiles).toHaveBeenCalledWith(7, scope);
    });

    it('lista podpisow pisma i zbiorcze plakietki dostaja osobe, zakres i dane z zadania', async () => {
        const scope = { projectOurIds: ['A'] };
        const one = makeRes();
        const many = makeRes();

        await call(routes['GET /letter/:id/signatures'], { params: { id: '7' }, session: { userData: PERSON }, projectScope: scope }, one);
        await call(routes['POST /letters/signatureSummary'], { body: { letterIds: [7, 8] }, session: { userData: PERSON }, projectScope: scope }, many);

        expect(controller.listLetterSignatures).toHaveBeenCalledWith(7, scope);
        expect(controller.summarizeLetterSignatures).toHaveBeenCalledWith({ letterIds: [7, 8] }, scope);
        expect(one.body).toEqual({ letterId: 7, signatures: [] });
        expect(many.body).toEqual({ summary: {} });
    });

    describe('pobranie instalatora ENVI Podpis', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envi-podpis-test-'));
        afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

        it('oddaje plik jako zalacznik EnviPodpis.exe, bez cache`owania posredniego', async () => {
            const exe = path.join(dir, 'EnviPodpis.exe');
            fs.writeFileSync(exe, Buffer.from('MZ-test-exe'));
            const withFile = collect(controller, { programExePath: exe });
            const res = makeRes();

            await call(withFile['GET /signing/program/download'], { params: {}, session: { userData: PERSON } }, res);

            expect(res.headers['Content-Disposition']).toBe('attachment; filename="EnviPodpis.exe"');
            expect(res.headers['Content-Type']).toBe('application/octet-stream');
            expect(res.headers['Cache-Control']).toBe('no-cache');
            expect(res.body.toString()).toBe('MZ-test-exe');
        });

        it('brak pliku na serwerze to czytelne 404, a nie awaria', async () => {
            const missing = collect(controller, { programExePath: path.join(dir, 'nie-ma.exe') });

            const next = await call(missing['GET /signing/program/download'], { params: {}, session: { userData: PERSON } }, makeRes());

            expect(next.mock.calls[0][0]).toBeInstanceOf(SigningJobError);
            expect(next.mock.calls[0][0].status).toBe(404);
            expect(next.mock.calls[0][0].message).toMatch(/Instalator programu ENVI Podpis/);
        });

        it('produkcyjna sciezka domyslna wskazuje plik, ktory naprawde lezy w repozytorium', () => {
            expect(fs.existsSync(path.resolve(process.cwd(), 'assets', 'signing', 'EnviPodpis.exe'))).toBe(true);
        });
    });

    it('podglad zwraca PDF inline bez cache', async () => {
        const res = makeRes();

        await call(routes['GET /signingJob/:id/file/:index/preview'], { params: { id: '3', index: '1' }, session: { userData: PERSON } }, res);

        expect(controller.getPreview).toHaveBeenCalledWith(3, 125, 1);
        expect(res.headers['Content-Type']).toBe('application/pdf');
        expect(res.headers['Cache-Control']).toBe('no-store');
        expect(res.headers['Content-Disposition']).toBe("inline; filename*=UTF-8''%C5%BB%C3%B3%C5%82%C4%87.pdf");
        expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('trasy programu dzialaja bez sesji, na samym tokenie, i nie cache`uja odpowiedzi', async () => {
        const token = 'A1b2C3d4E5f6G7h8I9j0K-L_mN';
        const res = makeRes();

        await call(routes['GET /signing/jobs/:token'], { params: { token }, session: {} }, res);
        await call(routes['POST /signing/jobs/:token/certificate'], { params: { token }, body: { chain: ['x'] }, session: {} }, makeRes());
        await call(routes['POST /signing/jobs/:token/signatures'], { params: { token }, body: { signatures: [] }, session: {} }, makeRes());
        await call(routes['POST /signing/jobs/:token/cancel'], { params: { token }, body: { reason: 'r' }, session: {} }, makeRes());

        expect(controller.getJobForProgram).toHaveBeenCalledWith(token);
        expect(controller.submitCertificate).toHaveBeenCalledWith(token, { chain: ['x'] });
        expect(controller.submitSignatures).toHaveBeenCalledWith(token, { signatures: [] });
        expect(controller.cancelByProgram).toHaveBeenCalledWith(token, { reason: 'r' });
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('blad kontrolera trafia do next (globalny handler mapuje status 4xx bez raportu awarii)', async () => {
        controller.getJobForProgram.mockRejectedValue(new SigningJobError('NOT_FOUND', 'Nie znaleziono', 404));

        const next = await call(routes['GET /signing/jobs/:token'], { params: { token: 'x' }, session: {} }, makeRes());

        expect(next.mock.calls[0][0].status).toBe(404);
    });
});
