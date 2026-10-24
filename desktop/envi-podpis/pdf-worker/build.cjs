'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const AdmZip = require('adm-zip');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '../../..');
const VERSION = '22.23.3';
const ZIP_HASH = '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71';
const RUNTIME_URL = `https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-win-x64.zip`;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build requires Windows x64.');
    const bin = path.resolve(__dirname, '../bin');
    fs.mkdirSync(bin, { recursive: true });
    const out = fs.mkdtempSync(path.join(bin, 'pdf-worker-'));
    const compiled = path.join(ROOT, 'build/podpis-worker');
    const source = path.join(ROOT, 'src/signing');
    const program = ts.createProgram(['PdfSigning.ts', 'PdfPageRenderer.ts', '__tests__/testPki.ts', '__tests__/testPdfs.ts'].map((file) => path.join(source, file)), {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
        strict: true, skipLibCheck: true, types: ['node'], rootDir: source, outDir: compiled, listEmittedFiles: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => ROOT, getCanonicalFileName: (file) => file, getNewLine: () => '\n',
    }));
    const emitted = program.emit();
    if (emitted.emitSkipped || !emitted.emittedFiles?.length) throw new Error('TypeScript emit failed.');
    fs.mkdirSync(path.join(out, 'core'));
    // Only emitted pure modules; test keys/fixtures and server code never enter the distribution.
    for (const file of emitted.emittedFiles) {
        if (path.dirname(path.resolve(file)) === compiled && file.endsWith('.js')) fs.copyFileSync(file, path.join(out, 'core', path.basename(file)));
    }
    fs.copyFileSync(path.join(__dirname, 'worker.cjs'), path.join(out, 'worker.cjs'));
    fs.copyFileSync(path.join(__dirname, '../mail-worker/worker.cjs'), path.join(out, 'mail-worker.cjs'));
    fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: 'envi-podpis-pdf-worker', private: true, version: '0.0.0' }));
    const assets = path.join(out, 'assets/signing');
    fs.mkdirSync(assets, { recursive: true });
    for (const file of ['envi_podpis_symbol_96x96_transparent.png', 'OpenSans-Regular.ttf', 'OpenSans-Bold.ttf', 'LICENSE-OpenSans-OFL.txt']) {
        fs.copyFileSync(path.join(ROOT, 'assets/signing', file), path.join(assets, file));
    }
    const packages = [];
    const copied = new Set();
    function copyPackage(name, from) {
        const resolve = createRequire(path.join(from, 'package.json'));
        let dir = path.dirname(resolve.resolve(name));
        while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) {
            const parent = path.dirname(dir);
            if (parent === dir) throw new Error('Missing package metadata: ' + name);
            dir = parent;
        }
        const metadataPath = path.join(dir, 'package.json');
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const relative = path.relative(ROOT, dir);
        if (!relative.startsWith('node_modules' + path.sep)) throw new Error('Dependency outside repository: ' + name);
        const destination = path.join(out, relative);
        if (copied.has(dir)) return;
        copied.add(dir);
        fs.cpSync(dir, destination, { recursive: true, filter: (file) => !path.relative(dir, file).split(path.sep).includes('node_modules') });
        packages.push({ name, version: metadata.version, license: metadata.license || 'SEE PACKAGE LICENSE', path: relative.split(path.sep).join('/') });
        for (const dependency of Object.keys(metadata.dependencies || {})) copyPackage(dependency, dir);
    }
    for (const name of ['pdf-lib', '@pdf-lib/fontkit', 'asn1js', 'pkijs', 'pdfjs-dist', '@napi-rs/canvas', '@napi-rs/canvas-win32-x64-msvc', 'imapflow', 'mailparser', 'nodemailer']) copyPackage(name, ROOT);

    const cache = path.join(os.tmpdir(), 'envi-podpis-node-' + VERSION);
    fs.mkdirSync(cache, { recursive: true });
    const zip = path.join(cache, 'runtime.zip');
    if (!fs.existsSync(zip) || hash(zip) !== ZIP_HASH) {
        const response = await fetch(RUNTIME_URL, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error('Node download failed: ' + response.status);
        const data = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(data).digest('hex') !== ZIP_HASH) throw new Error('Node checksum mismatch.');
        fs.writeFileSync(zip, data);
    }
    const archive = new AdmZip(zip);
    fs.writeFileSync(path.join(out, 'node.exe'), archive.readFile(`node-v${VERSION}-win-x64/node.exe`));
    fs.writeFileSync(path.join(out, 'LICENSE-Node.txt'), archive.readFile(`node-v${VERSION}-win-x64/LICENSE`));
    fs.writeFileSync(path.join(out, 'THIRD-PARTY.json'), JSON.stringify({ runtime: { version: VERSION, url: RUNTIME_URL, sha256: ZIP_HASH },
        packages: packages.sort((a, b) => a.name.localeCompare(b.name)), fonts: 'assets/signing/LICENSE-OpenSans-OFL.txt' }, null, 2));
    const files = [];
    function scan(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) scan(file);
            else files.push({ path: path.relative(out, file).split(path.sep).join('/'), sha256: hash(file) });
        }
    }
    scan(out);
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ protocol: 1, runtime: 'v' + VERSION, files }, null, 2));
    console.log(out);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
