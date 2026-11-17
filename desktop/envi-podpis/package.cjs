'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const root = __dirname;
const worker = path.resolve(process.argv[2] || '');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Requires Windows x64.');
execFileSync(process.env.ComSpec, ['/d', '/c', 'build.cmd'], { cwd: root, stdio: 'inherit' });
const manifest = JSON.parse(fs.readFileSync(path.join(worker, 'manifest.json'), 'utf8'));
if (manifest.protocol !== 1 || manifest.runtime !== process.version) throw Error('Use the worker bundled Node runtime.');
for (const file of manifest.files) {
    const full = path.resolve(worker, file.path);
    if (!full.startsWith(worker + path.sep) || sha(full) !== file.sha256) throw Error('Corrupt worker: ' + file.path);
}
const out = fs.mkdtempSync(path.join(root, 'bin', 'installer-'));
const payload = path.join(out, 'payload');
fs.mkdirSync(payload);
fs.copyFileSync(path.join(root, 'bin', 'EnviPodpis.exe'), path.join(payload, 'EnviPodpis.exe'));
fs.cpSync(worker, path.join(payload, 'pdf-worker'), { recursive: true });
const files = [];
function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isSymbolicLink()) throw Error('Symlink in payload.');
        if (item.isDirectory()) scan(file);
        else files.push({ path: path.relative(payload, file).split(path.sep).join('/'), sha256: sha(file) });
    }
}
scan(payload);
fs.writeFileSync(path.join(payload, 'payload.json'), JSON.stringify({ format: 1, files }, null, 2));
const zip = new AdmZip();
zip.addLocalFolder(payload);
const zipPath = path.join(out, 'payload.zip');
zip.writeZip(zipPath);
const csc = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const sources = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.cs')).map(f => path.join(root, 'src', f));
const exe = path.join(out, 'EnviPodpisSetup.exe');
execFileSync(csc, ['/nologo', '/target:winexe', '/main:EnviPodpis.SetupMain', '/platform:anycpu', '/optimize+', '/codepage:65001',
    '/win32icon:' + path.join(root, 'assets/envi-podpis.ico'), '/win32manifest:' + path.join(root, 'src/app.manifest'), '/out:' + exe, '/resource:' + zipPath + ',payload.zip',
    ...['System', 'System.Core', 'System.Windows.Forms', 'System.Drawing', 'System.Web.Extensions', 'System.IO.Compression', 'System.Security', 'System.Net.Http', 'System.Web'].map(r => '/r:' + r + '.dll'), ...sources], { stdio: 'inherit' });
fs.writeFileSync(path.join(out, 'SHA256.txt'), sha(exe) + '  EnviPodpisSetup.exe\n');
console.log(out);
