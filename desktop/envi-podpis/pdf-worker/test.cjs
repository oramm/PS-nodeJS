'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const pkijs = require('pkijs');
const asn1js = require('asn1js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ROOT = path.resolve(__dirname, '../../..');
const { createTestIdentity, softwareCardSign } = require(path.join(ROOT, 'build/podpis-worker/__tests__/testPki.js'));
const { makeFixture } = require(path.join(ROOT, 'build/podpis-worker/__tests__/testPdfs.js'));
const { readByteRanges, signedBytes } = require(path.join(ROOT, 'build/podpis-worker/PdfSignatureLayout.js'));
const b64 = (bytes) => bytes.toString('base64');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main() {
    const source = path.resolve(process.argv[2] || '');
    assert(fs.existsSync(path.join(source, 'manifest.json')), 'Pass the built distribution directory.');
    const run = fs.mkdtempSync(path.join(os.tmpdir(), 'envi-podpis-offline-'));
    const dist = path.join(run, 'paczka ze spacja');
    fs.cpSync(source, dist, { recursive: true });
    const profile = path.join(run, 'empty-profile');
    fs.mkdirSync(profile);
    const guard = path.join(dist, 'deny-network.cjs');
    fs.writeFileSync(guard, `
        const deny = () => { throw new Error('NETWORK_DISABLED_FOR_TEST'); };
        require('node:net').Socket.prototype.connect = deny;
        require('node:dgram').Socket.prototype.send = deny;
        require('node:dns').lookup = deny;
        require('node:dns').promises.lookup = deny;
        globalThis.fetch = deny;
        const child = require('node:child_process');
        for (const key of ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync']) child[key] = deny;
    `);
    const children = new Set();
    function client() {
        const child = spawn(path.join(dist, 'node.exe'), ['--experimental-permission', '--allow-addons', '--allow-fs-read=' + dist,
            '--require', guard, path.join(dist, 'worker.cjs')], {
            cwd: os.tmpdir(), windowsHide: true,
            env: { SystemRoot: process.env.SystemRoot, windir: process.env.SystemRoot,
                PATH: path.join(process.env.SystemRoot, 'System32'), USERPROFILE: profile, HOME: profile,
                APPDATA: profile, LOCALAPPDATA: profile, TEMP: profile, TMP: profile },
        });
        children.add(child);
        let pending = '';
        let stderr = '';
        let waiter;
        let early;
        const closed = once(child, 'close');
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.stdout.on('data', (chunk) => {
            pending += chunk;
            assert(pending.length <= 64 * 1024 * 1024, 'bounded worker response');
            let end;
            while ((end = pending.indexOf('\n')) >= 0) {
                const line = pending.slice(0, end);
                pending = pending.slice(end + 1);
                let value;
                try { value = JSON.parse(line); }
                catch { waiter?.reject(new Error('Malformed worker response: ' + line.slice(0, 100))); child.kill(); return; }
                if (waiter) { const current = waiter; waiter = undefined; current.resolve(value); }
                else early = value;
            }
        });
        child.on('error', (error) => waiter?.reject(error));
        child.on('close', (code) => {
            children.delete(child);
            if (waiter) waiter.reject(new Error('Worker exited: ' + code + ' ' + stderr));
        });
        function receive() {
            if (early) { const result = early; early = undefined; return Promise.resolve(result); }
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { child.kill(); reject(new Error('Worker timeout: ' + stderr)); }, 45_000);
                waiter = { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } };
            });
        }
        return {
            ready: receive,
            request: (value) => { const result = receive(); child.stdin.write((typeof value === 'string' ? value : JSON.stringify(value)) + '\n'); return result; },
            stop: async () => { child.stdin.end(); return closed; },
            cancel: async () => { child.kill(); await closed; },
        };
    }
    try {
        const identity = await createTestIdentity('Żaneta Gęślarz-Łoś');
        const pdf = await makeFixture({ lines: [{ x: 60, y: 650, text: 'Test lokalny ENVI — ąćęłńóśźż' }] });
        const originalHash = digest(pdf);
        fs.writeFileSync(path.join(run, 'source.pdf'), pdf);
        const worker = client();
        assert.equal((await worker.ready()).ready, true);
        assert.equal((await worker.request('{bad json')).code, 'INVALID_REQUEST');
        assert.equal((await worker.request({ op: 'finalize', signature: 'YQ==' })).code, 'INVALID_STATE');
        assert.equal((await worker.request({ op: 'prepare', pin: 'NEVER-A-REAL-PIN' })).code, 'INVALID_REQUEST');
        assert.equal((await worker.request({ op: 'validate', pdf: 'not base64' })).code, 'INVALID_REQUEST');
        assert.equal((await worker.request({ op: 'prepare', pdf: b64(pdf), chain: identity.chainDer.map(b64), placement: 'letterClosing' })).code, 'INVALID_REQUEST');
        const prepared = await worker.request({ op: 'prepare', pdf: b64(pdf), chain: identity.chainDer.map(b64), placement: 'lastPageCorner' });
        assert.equal(prepared.ok, true, JSON.stringify(prepared));
        const frozen = Buffer.from(prepared.result.pdf, 'base64');
        assert.equal((await worker.request({ op: 'prepare' })).code, 'INVALID_STATE');
        assert.equal((await worker.request({ op: 'render', page: 1, pdf: b64(pdf) })).code, 'INVALID_STATE');
        const preview = await worker.request({ op: 'render', page: 1 });
        assert.equal(preview.ok, true, JSON.stringify(preview));
        const png = Buffer.from(preview.result.png, 'base64');
        const image = await loadImage(png);
        const canvas = createCanvas(image.width, image.height);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        assert(pixels.some((v, i) => i % 4 !== 3 && v < 100), 'preview contains actual visible content');
        fs.writeFileSync(path.join(run, 'prepared-preview.png'), png);
        fs.writeFileSync(path.join(run, 'prepared.pdf'), frozen);
        const signature = softwareCardSign(Buffer.from(prepared.result.hash, 'base64'), identity.privateKey);
        assert.equal((await worker.request({ op: 'finalize', signature: b64(Buffer.alloc(256)) })).ok, false);
        const finalized = await worker.request({ op: 'finalize', signature: b64(signature) });
        assert.equal(finalized.ok, true, JSON.stringify(finalized));
        assert.equal(finalized.result.validation.valid, true);
        const signed = Buffer.from(finalized.result.pdf, 'base64');
        const [range] = readByteRanges(signed);
        assert(signed.subarray(0, range.contentsStart).equals(frozen.subarray(0, range.contentsStart)));
        assert(signed.subarray(range.contentsEnd).equals(frozen.subarray(range.contentsEnd)), 'only the reserved signature bytes changed');
        const der = Buffer.from(signed.subarray(range.contentsStart + 1, range.contentsEnd - 1).toString('latin1'), 'hex');
        const cms = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: asn1js.fromBER(der).result }).content });
        assert.equal(await cms.verify({ signer: 0, data: signedBytes(signed, range), checkChain: false }), true, 'independent PKIjs cryptographic verification');
        fs.writeFileSync(path.join(run, 'signed_pdp.pdf'), signed);
        const tampered = Buffer.from(signed);
        const dateAt = tampered.indexOf('/M (D:');
        assert(dateAt > 0);
        tampered[dateAt + 8] ^= 1;
        assert.equal((await worker.request({ op: 'validate', pdf: b64(tampered) })).result.valid, false);
        assert.equal((await worker.request({ op: 'finalize', signature: b64(signature) })).code, 'INVALID_STATE');
        assert.deepEqual(await worker.stop(), [0, null]);

        const second = client();
        assert.equal((await second.ready()).ready, true);
        const revision = await second.request({ op: 'prepare', pdf: b64(signed), chain: identity.chainDer.map(b64), placement: 'none' });
        assert.equal(revision.ok, true, JSON.stringify(revision));
        const secondResult = await second.request({ op: 'finalize', signature: b64(softwareCardSign(Buffer.from(revision.result.hash, 'base64'), identity.privateKey)) });
        assert.equal(secondResult.ok, true);
        assert.equal(secondResult.result.validation.signatures.length, 2);
        assert(secondResult.result.validation.signatures.every((value) => value.valid));
        assert(Buffer.from(secondResult.result.pdf, 'base64').subarray(0, signed.length).equals(signed));
        await second.stop();

        for (const entry of ['assets/signing/OpenSans-Regular.ttf', 'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node']) {
            const file = path.join(dist, entry);
            const backup = file + '.test-backup';
            fs.renameSync(file, backup);
            try {
                const broken = client();
                assert.equal((await broken.ready()).code, 'DEPENDENCY_ERROR');
                await broken.stop();
            } finally { fs.renameSync(backup, file); }
        }
        for (const entry of ['core/PdfSigning.js', 'node_modules/pdf-lib/cjs/index.js', 'node_modules/pdfjs-dist/standard_fonts/FoxitSerif.pfb']) {
            const corruptFile = path.join(dist, entry);
            const clean = fs.readFileSync(corruptFile);
            fs.appendFileSync(corruptFile, '\n// corruption test');
            try {
                const broken = client();
                assert.equal((await broken.ready()).code, 'DEPENDENCY_ERROR');
                await broken.stop();
            } finally { fs.writeFileSync(corruptFile, clean); }
        }
        const cancelled = client();
        assert.equal((await cancelled.ready()).ready, true);
        await cancelled.cancel();
        assert.equal(children.size, 0, 'all child processes reaped');
        assert.equal(digest(fs.readFileSync(path.join(run, 'source.pdf'))), originalHash, 'source preserved');
        assert.equal(fs.readdirSync(profile).length, 0, 'empty profile remains empty');
        console.log(JSON.stringify({ result: 'PASS', run, runtime: JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'))).runtime,
            checks: 'preview, frozen bytes, independent CMS verification, tamper rejection, prior signature, protocol validation, missing/corrupt dependencies, cancellation/reaping',
            isolation: 'copied distribution, arbitrary cwd, blank profile variables, no global runtime on PATH, filesystem permission boundary, JS network/process APIs denied (not OS network isolation)' }, null, 2));
    } finally {
        for (const child of children) { const closed = once(child, 'close'); child.kill(); await closed; }
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
