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
let key, signatures = 0, gets = 0, status = 'created';
const server = http.createServer(async (req, res) => {
    try {
        const version = fs.readFileSync(path.join(__dirname, 'src/AssemblyInfo.cs'), 'utf8').match(/AssemblyVersion\("(\d+\.\d+\.\d+)\.\d+"\)/)[1];
        assert.equal(req.headers['user-agent'], 'ENVI-Podpis/' + version);
        assert.ok(req.url.startsWith('/signing/jobs/' + token));
        let text = '';
        for await (const chunk of req) { text += chunk; assert.ok(text.length < 100_000); }
        const body = text ? JSON.parse(text) : {};
        let result;
        if (req.method === 'GET') { gets++; result = { status, minProgramVersion: '1.0.0', files: data.map((_, i) => ({ name: `synthetic-${i}.pdf` })) }; }
        else if (req.url.endsWith('/certificate')) {
            key = new crypto.X509Certificate(Buffer.from(body.chain[0], 'base64')).publicKey;
            result = { files: hashes.map((hash, i) => ({ name: `synthetic-${i}.pdf`, pages: 1, hashToSign: hash.toString('hex'), checkCode: hash.subarray(0, 4).toString('hex').toUpperCase() })) };
        } else if (req.url.endsWith('/signatures')) {
            assert.equal(body.signatures.length, 2);
            for (const item of body.signatures) { assert.ok(crypto.verify('sha256', data[item.index], key, Buffer.from(item.signature, 'base64'))); signatures++; }
            result = { status: 'done' };
        } else throw Error('Unexpected request');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
        fs.writeFileSync(path.join(proof, 'ps-mock.json'), JSON.stringify({ gets, signatures, status }));
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
        assert.equal(await run(['/selftest', path.join(proof, 'ps-soft.txt'), 'soft', token], 30_000), 0);
        assert.equal(signatures, 2); assert.equal(gets, 1);
        console.log('PASS PS API, version headers, 2 software RSA signatures verified by mock.');
        if (ui) {
            status = 'expired';
            console.log('Opening real PS protocol window against expired synthetic job; close after inspection.');
            assert.equal(await run(['envi-podpis://job/' + token], 180_000), 0);
            assert.equal(gets, 2);
            console.log('PASS protocol launch requested fixture job.');
        }
    } finally { server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
