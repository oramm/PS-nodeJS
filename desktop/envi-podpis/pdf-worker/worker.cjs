'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const ROOT = __dirname;
const MAX_PDF = 32 * 1024 * 1024;
const MAX_MESSAGE = 48 * 1024 * 1024;
// One process owns one prepared document; the desktop kills it on cancellation/timeout.
let prepared;
let chain;
let core;
let render;
let finished = false;
console.log = console.warn = (...args) => process.stderr.write(args.join(' ') + '\n');

function fail(code, message) {
    throw Object.assign(new Error(message), { code });
}
function fields(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key))) {
        fail('INVALID_REQUEST', 'Nieprawidlowe pola polecenia.');
    }
}
function bytes(value, limit) {
    if (typeof value !== 'string' || !value.length || value.length > Math.ceil(limit / 3) * 4) {
        fail('INVALID_REQUEST', 'Oczekiwano danych base64 o dozwolonym rozmiarze.');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length > limit || decoded.toString('base64') !== value) fail('INVALID_REQUEST', 'Nieprawidlowe base64.');
    return decoded;
}
function placement(value) {
    if (value === 'none' || value === 'lastPageCorner') return value;
    fields(value, ['page', 'rect']);
    fields(value.rect, ['x', 'y', 'width', 'height']);
    if (!Number.isInteger(value.page) || value.page < 1 ||
        !['x', 'y', 'width', 'height'].every((key) => typeof value.rect[key] === 'number' && Number.isFinite(value.rect[key]))) {
        fail('INVALID_REQUEST', 'Nieprawidlowe miejsce grafiki.');
    }
    return value;
}
async function dispatch(request) {
    if (!request || typeof request.op !== 'string') fail('INVALID_REQUEST', 'Brak polecenia.');
    switch (request.op) {
        case 'inspect': {
            fields(request, ['op', 'pdf']);
            const { PDFDocument, EncryptedPDFError } = require('pdf-lib');
            const { isPlaceablePage } = require('./core/ContractorSignaturePlace.js');
            const { SIGNATURE_WIDTH_REL, SIGNATURE_HEIGHT_REL } = require('./core/SignaturePlacement.js');
            let document;
            try { document = await PDFDocument.load(bytes(request.pdf, MAX_PDF), { updateMetadata: false }); }
            catch (error) {
                fail(error instanceof EncryptedPDFError ? 'ENCRYPTED_PDF' : 'INVALID_PDF', 'Nie mozna odczytac PDF.');
            }
            const pages = document.getPages().map((page) => {
                const { width, height } = page.getMediaBox();
                if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 14400))
                    fail('INVALID_PDF', 'Nieobslugiwane wymiary strony.');
                return { width, height, placeable: isPlaceablePage(page) };
            });
            if (!pages.length) fail('INVALID_PDF', 'PDF nie zawiera stron.');
            return { pages, stampRel: { width: SIGNATURE_WIDTH_REL, height: SIGNATURE_HEIGHT_REL } };
        }
        case 'prepare': {
            fields(request, ['op', 'pdf', 'chain', 'placement']);
            if (prepared || finished) fail('INVALID_STATE', 'Uruchom nowy proces dla kolejnego PDF.');
            if (!Array.isArray(request.chain) || request.chain.length < 1 || request.chain.length > 8) fail('INVALID_REQUEST', 'Nieprawidlowy lancuch certyfikatow.');
            const certificates = request.chain.map((cert) => bytes(cert, 64 * 1024));
            const result = await core.prepare(bytes(request.pdf, MAX_PDF), certificates, placement(request.placement));
            if (result.preparedPdf.length > MAX_PDF) fail('PDF_TOO_LARGE', 'Przygotowany PDF przekracza limit 32 MiB.');
            prepared = result;
            chain = certificates;
            return { pdf: result.preparedPdf.toString('base64'), hash: result.hashToSign.toString('base64'),
                checkCode: result.checkCode, pages: result.pages, placement: result.placement, signerName: result.signerName };
        }
        case 'render': {
            fields(request, ['op', 'pdf', 'page']);
            if (!Number.isInteger(request.page) || request.page < 1) fail('INVALID_REQUEST', 'Nieprawidlowy numer strony.');
            if (prepared && request.pdf !== undefined) fail('INVALID_STATE', 'Podglad musi uzywac przygotowanych bajtow.');
            const pdf = prepared ? prepared.preparedPdf : bytes(request.pdf, MAX_PDF);
            const result = await render(pdf, request.page);
            return { png: result.png.toString('base64'), widthPx: result.widthPx, heightPx: result.heightPx };
        }
        case 'finalize': {
            fields(request, ['op', 'signature']);
            if (!prepared || finished) fail('INVALID_STATE', 'Najpierw przygotuj PDF.');
            const pdf = core.finalize(prepared.preparedPdf, prepared.signedAttrsDer, bytes(request.signature, 1024), chain);
            const validation = core.validate(pdf);
            if (!validation.valid) fail('INVALID_SIGNATURE', 'Podpis nie przeszedl kontroli kryptograficznej.');
            finished = true;
            return { pdf: pdf.toString('base64'), validation };
        }
        case 'validate':
            fields(request, ['op', 'pdf']);
            return core.validate(bytes(request.pdf, MAX_PDF));
        default: fail('INVALID_REQUEST', 'Nieznane polecenie.');
    }
}
async function send(value) {
    if (!process.stdout.write(JSON.stringify(value) + '\n')) await once(process.stdout, 'drain');
}
async function main() {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
        if (process.version !== manifest.runtime) throw new Error('runtime');
        // Bounded concurrent reads avoid serial antivirus/IO stalls without skipping dependencies.
        for (let at = 0; at < manifest.files.length; at += 24) {
            await Promise.all(manifest.files.slice(at, at + 24).map(async (entry) => {
                const file = path.resolve(ROOT, entry.path);
                if (!file.startsWith(ROOT + path.sep)) throw new Error('integrity');
                const data = await fs.promises.readFile(file);
                if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error('integrity');
            }));
        }
        // Shared PS modules resolve resources from cwd; only this private child changes cwd.
        process.chdir(ROOT);
        core = require('./core/PdfSigning.js');
        render = require('./core/PdfPageRenderer.js').renderPdfPage;
        require('./core/SigningAssets.js').loadSigningAssets();
        const { nativeRequire } = require('./core/PdfPageAnalyzer.js');
        nativeRequire()('@napi-rs/canvas');
        require('./core/PdfPageAnalyzer.js').loadPdfjs();
        await send({ ready: true, protocol: 1, runtime: process.version });
    } catch {
        await send({ ok: false, code: 'DEPENDENCY_ERROR', message: 'Paczka PDF jest niekompletna lub uszkodzona. Zbuduj ja ponownie.' });
        process.exitCode = 1;
        return;
    }
    // Desktop owns the process lifetime; a user may inspect the preview for longer than two minutes.

    let pending = Buffer.alloc(0);
    try {
        for await (const chunk of process.stdin) {
            pending = Buffer.concat([pending, chunk]);
            if (pending.length > MAX_MESSAGE) fail('REQUEST_TOO_LARGE', 'Polecenie przekracza limit 48 MiB.');
            let end;
            while ((end = pending.indexOf(10)) !== -1) {
                const line = pending.subarray(0, end);
                pending = pending.subarray(end + 1);
                try {
                    const result = await dispatch(JSON.parse(line.toString('utf8')));
                    await send({ ok: true, result });
                } catch (error) {
                    await send({ ok: false, code: error instanceof SyntaxError ? 'INVALID_REQUEST' : error.code || 'PDF_ERROR',
                        message: error.code ? error.message : 'Nie mozna przetworzyc PDF. Sprawdz plik i polecenie.' });
                }
            }
        }
        if (pending.length) fail('INVALID_REQUEST', 'Niepelne polecenie JSON.');
    } catch (error) {
        await send({ ok: false, code: error.code || 'PDF_ERROR', message: error.message });
        process.exitCode = 1;
    }
}
main().catch(() => { process.exitCode = 1; });
