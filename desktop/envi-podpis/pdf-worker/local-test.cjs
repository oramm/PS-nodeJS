'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFDocument, degrees } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');
const pkijs = require('pkijs');
const asn1js = require('asn1js');
const root = path.resolve(__dirname, '../../..');
const { createTestIdentity, softwareCardSign } = require(path.join(root, 'build/podpis-worker/__tests__/testPki.js'));
const { makeFixture } = require(path.join(root, 'build/podpis-worker/__tests__/testPdfs.js'));
const { readByteRanges, signedBytes } = require(path.join(root, 'build/podpis-worker/PdfSignatureLayout.js'));
const core = require(path.join(root, 'build/podpis-worker/PdfSigning.js'));
const names = ['letter', 'form', 'dense', 'scan', 'multi', 'rotation', 'crop', 'nonstandard', 'prior'];
const digest = (data) => createHash('sha256').update(data).digest('hex');

async function main() {
    const [mode, directory] = process.argv.slice(2);
    assert(directory && path.isAbsolute(directory));
    if (mode === 'fixtures') {
        fs.mkdirSync(directory, { recursive: true });
        for (const name of names) {
            let bytes = await makeFixture({ lines: [{ x: 60, y: 710, text: 'ENVI Podpis — dokument testowy: ' + name },
                { x: 60, y: 550, text: 'Podpis wykonawcy w tresci nie klasyfikuje dokumentu jako oferty.' }],
                twoPages: name === 'multi', rotated: name === 'rotation', crop: name === 'crop' });
            if (['form', 'dense', 'scan', 'nonstandard'].includes(name)) {
                const doc = await PDFDocument.load(bytes), page = doc.getPage(0);
                if (name === 'form') {
                    const field = doc.getForm().createTextField('test-name'); field.setText('Jan Testowy');
                    field.addToPage(page, { x: 70, y: 400, width: 200, height: 30 });
                }
                if (name === 'dense') {
                    for (let y = 8; y < 840; y += 10) page.drawText('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', { x: 0, y, size: 11 });
                }
                if (name === 'scan') {
                    const canvas = createCanvas(595, 842), ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ededed'; ctx.fillRect(0, 0, 595, 842);
                    ctx.fillStyle = '#111'; ctx.font = '18px sans-serif'; ctx.fillText('SKAN — TYLKO TEST', 70, 110);
                    const png = await doc.embedPng(canvas.toBuffer('image/png'));
                    page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
                }
                if (name === 'nonstandard') page.setSize(720, 540);
                bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
            }
            if (name === 'prior') {
                const identity = await createTestIdentity('Poprzedni Testowy');
                const prepared = await core.prepare(bytes, identity.chainDer, 'none');
                bytes = core.finalize(prepared.preparedPdf, prepared.signedAttrsDer,
                    softwareCardSign(prepared.hashToSign, identity.privateKey), identity.chainDer);
            }
            fs.writeFileSync(path.join(directory, name + '.pdf'), bytes);
        }
        fs.writeFileSync(path.join(directory, 'damaged.pdf'), 'not a PDF');
        fs.writeFileSync(path.join(directory, 'source-hashes.json'), JSON.stringify(Object.fromEntries(names.map((name) => [name, digest(fs.readFileSync(path.join(directory, name + '.pdf')))])), null, 2));
        console.log('FIXTURES PASS: ' + directory);
        return;
    }
    assert.equal(mode, 'verify');
    const source = path.dirname(directory);
    const hashes = JSON.parse(fs.readFileSync(path.join(source, 'source-hashes.json')));
    let signatures = 0;
    for (const name of names) {
        const signed = fs.readFileSync(path.join(directory, name + '_pdp.pdf'));
        const prepared = fs.readFileSync(path.join(directory, name + '.prepared.pdf'));
        const ranges = readByteRanges(signed);
        assert.equal(ranges.length, name === 'prior' ? 2 : 1);
        for (const range of ranges) {
            const der = Buffer.from(signed.subarray(range.contentsStart + 1, range.contentsEnd - 1).toString('latin1'), 'hex');
            const cms = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: asn1js.fromBER(der).result }).content });
            assert.equal(await cms.verify({ signer: 0, data: signedBytes(signed, range), checkChain: false }), true, name + ': independent CMS');
            signatures++;
        }
        const last = ranges[ranges.length - 1];
        assert(signed.subarray(0, last.contentsStart).equals(prepared.subarray(0, last.contentsStart)), name + ': preview prefix');
        assert(signed.subarray(last.contentsEnd).equals(prepared.subarray(last.contentsEnd)), name + ': preview suffix');
        assert.equal(digest(fs.readFileSync(path.join(source, name + '.pdf'))), hashes[name], name + ': source unchanged');
    }
    console.log(JSON.stringify({ result: 'PASS', files: names.length, independentCmsSignatures: signatures, exactPreviewedBytes: true, sourceHashesUnchanged: true, directory }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
