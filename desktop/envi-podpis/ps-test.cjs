'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const exe = path.resolve(process.argv[2]);
const proof = path.resolve(process.argv[3]);
const ui = process.argv.includes('--ui');
const token = 'SyntheticPsJob_1234567890';
const data = [Buffer.from('synthetic letter'), Buffer.from('synthetic attachment')];
const hashes = data.map(b => crypto.createHash('sha256').update(b).digest());
let key, signatures, posts, gets, status, scenario;
function send(res, status, result) {
    const json = typeof result !== 'string';
    res.writeHead(status, { 'Content-Type': json ? 'application/json' : 'text/html' });
    res.end(json ? JSON.stringify(result) : result);
}
const server = http.createServer(async (req, res) => {
    try {
        const version = fs.readFileSync(path.join(__dirname, 'src/AssemblyInfo.cs'), 'utf8').match(/AssemblyVersion\("(\d+\.\d+\.\d+)\.\d+"\)/)[1];
        assert.equal(req.headers['user-agent'], 'ENVI-Podpis/' + version);
        assert.ok(req.url.startsWith('/signing/jobs/' + token));
        let text = '';
        for await (const chunk of req) { text += chunk; assert.ok(text.length < 100_000); }
        const body = text ? JSON.parse(text) : {};
        let result;
        if (req.method === 'GET') {
            gets++;
            const next = posts ? scenario.checks.shift() : null;
            if (typeof next === 'number') return send(res, next, '<html>Temporary failure</html>');
            if (next) status = next;
            result = { status, minProgramVersion: '1.0.0', files: data.map((_, i) => ({ name: `synthetic-${i}.pdf` })) };
        }
        else if (req.url.endsWith('/certificate')) {
            key = new crypto.X509Certificate(Buffer.from(body.chain[0], 'base64')).publicKey;
            result = { files: hashes.map((hash, i) => ({ name: `synthetic-${i}.pdf`, pages: 1, hashToSign: hash.toString('hex'), checkCode: hash.subarray(0, 4).toString('hex').toUpperCase() })) };
        } else if (req.url.endsWith('/signatures')) {
            posts++;
            assert.equal(body.signatures.length, 2);
            for (const item of body.signatures) { assert.ok(crypto.verify('sha256', data[item.index], key, Buffer.from(item.signature, 'base64'))); signatures++; }
            if (scenario.response === 503) return send(res, 503, '<html>Request timeout</html>');
            result = scenario.response;
        } else throw Error('Unexpected request');
        send(res, 200, result);
    } catch (error) { res.writeHead(500); res.end('{}'); console.error(error); process.exitCode = 1; }
});
async function run(args, timeout) {
    const child = spawn(exe, args, { windowsHide: !ui });
    const timer = setTimeout(() => child.kill(), timeout);
    try { return await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); }); }
    finally { clearTimeout(timer); }
}
async function main() {
    fs.mkdirSync(proof, { recursive: true });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, 'localhost', resolve); });
    try {
        const scenarios = [
            { name: 'normal', response: { status: 'done' }, checks: [], expected: /status=done/, success: true },
            { name: 'timeout-then-done', response: 503, checks: [503, 'finalizing', 'done'], expected: /status=done/, success: true },
            { name: 'timeout-then-failed', response: 503, checks: ['failed'], expected: /status=failed/, success: false },
            { name: 'unconfirmed', response: {}, checks: [404], expected: /PS nie potwierdził wyniku zapisu podpisów/, success: false },
        ];
        const evidence = [];
        for (scenario of scenarios) {
            posts = 0; signatures = 0; gets = 0; status = 'created';
            const expectedGets = 1 + scenario.checks.length;
            const resultPath = path.join(proof, `ps-soft-${scenario.name}.txt`);
            const code = await run(['/selftest', resultPath, 'soft', token], 30_000);
            assert.match(fs.readFileSync(resultPath, 'utf8'), scenario.expected, scenario.name);
            assert.equal(code, scenario.success ? 0 : 1, scenario.name);
            assert.equal(signatures, 2, scenario.name);
            assert.equal(posts, 1, scenario.name);
            assert.equal(gets, expectedGets, scenario.name);
            evidence.push({ name: scenario.name, gets, posts, signatures });
            console.log(`PASS PS API: ${scenario.name}, 2 verified software RSA signatures and exactly 1 submission.`);
        }
        fs.writeFileSync(path.join(proof, 'ps-mock.json'), JSON.stringify(evidence));
        if (ui) {
            posts = 0;
            gets = 0;
            status = 'expired';
            console.log('Opening real PS protocol window against expired synthetic job; close after inspection.');
            assert.equal(await run(['envi-podpis://job/' + token], 180_000), 0);
            assert.equal(gets, 1);
            console.log('PASS protocol launch requested fixture job.');
        }
    } finally { server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
