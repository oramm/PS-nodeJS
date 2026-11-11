import { lstat, mkdir, readdir, readFile, writeFile, mkdtemp, rm, rename } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const ts = createRequire(import.meta.url)('typescript');
const printer = ts.createPrinter({ removeComments: true });

export function allowedSource(path) {
    return /^src\//.test(path) && /\.(?:ts|tsx|js|jsx|css|html)$/.test(path) &&
        !path.split('/').some((part) => part.startsWith('.') || /^(?:node_modules|__tests__|tests?|test-support|fixtures?|__fixtures__|__mocks__|__snapshots__|seeds?|data|source|exports?|uploads?|attachments?|secrets?|credentials|certificates?|keys?|tokens?|scripts)$/i.test(part)) &&
        !/(?:^|[./_-])(?:test|spec|fixture|seeds?|secrets?|credentials|privatekey)(?:[./_-]|$)/i.test(path);
}

export function sanitizeSource(text) {
    return text
        .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----/g, '[ukryto]')
        .replace(/(?:sk-ant-|sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{16,}/g, '[ukryto]')
        .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[ukryto]')
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/'"<>]+:[^\s/'"<>]+@/gi, '$1[ukryto]@')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[ukryto]')
        .replace(
            /(?<![\w?&])((?:\w*(?:password|passwd|secret|token|api_?key|access_?key|private_?key)\w*|first_?name|last_?name|full_?name|phone|pesel|nip|tax_?nr|address)["']?\s*[:=]\s*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|(?!\$\{)[^`\\])*`)/gi,
            (_match, prefix, literal) => `${prefix}${literal[0]}[ukryto]${literal[0]}`,
        )
        .replace(
            /([?&](?:password|passwd|secret|token|api_?key|access_?key|private_?key)=)[A-Za-z0-9_+/.%-]{16,}=*/gi,
            '$1[ukryto]',
        )
        .replace(/(["'])(?:\+48[ -]?)?(?:\d[ -]?){9,11}\1/g, '$1[ukryto]$1');
}

async function copySource(sourceRoot, target) {
    async function walk(path) {
        const source = join(sourceRoot, path);
        const info = await lstat(source);
        if (info.isSymbolicLink()) return;
        if (info.isDirectory()) {
            for (const name of await readdir(source)) {
                if (!name.startsWith('.') && name !== 'node_modules') await walk(`${path}/${name}`);
            }
        } else if (info.isFile() && info.size <= 1024 * 1024 && allowedSource(path)) {
            let text;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(source)); }
            catch { return; }
            if (/[\x00-\x08\x0e-\x1f]/.test(text)) return;
            if (/\.[jt]sx?$/.test(path)) text = printer.printFile(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true));
            const destination = join(target, path);
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, sanitizeSource(text), { flag: 'wx' });
        }
    }
    // Sprawdzamy też korzeń: nie kopiujemy kodu przez junction lub symlink.
    if ((await lstat(sourceRoot)).isSymbolicLink()) throw new Error('Katalog źródłowy jest dowiązaniem.');
    await walk('src');
}

export async function snapshot(target, { serverRoot = root, siteRoot, version, siteVersion } = {}) {
    target = resolve(target);
    for (let dir = target; ; dir = dirname(dir)) {
        const info = await lstat(dir).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        if (info?.isSymbolicLink()) throw new Error('Dowiązanie w ścieżce docelowej.');
        if (dirname(dir) === dir) break;
    }
    for (const source of [serverRoot, siteRoot].filter(Boolean)) {
        const path = relative(resolve(source), target).split(sep).join('/');
        const reverse = relative(target, resolve(source)).split(sep).join('/');
        if (!path || path === 'src' || path.startsWith('src/') || (reverse !== '..' && !reverse.startsWith('../') && !reverse.includes(':')))
            throw new Error('Kopia nie może nadpisywać źródeł.');
    }
    await mkdir(target, { recursive: true });
    if ((await readdir(target)).length) throw new Error('Katalog kopii musi być pusty.');
    await copySource(resolve(serverRoot), join(target, 'server'));
    let hasSite = false;
    if (siteRoot) {
        try { await copySource(resolve(siteRoot), join(target, 'site')); hasSite = true; }
        catch {
            await rm(join(target, 'site'), { recursive: true, force: true });
            console.warn('[pomoc] Nie udało się skopiować ekranu; dostępny jest tylko kod serwera.');
        }
    } else console.warn('[pomoc] Brak ekranu; dostępny jest tylko kod serwera.');
    if (hasSite && !siteVersion) {
        try { siteVersion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: siteRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
        catch { siteVersion = `master z ${new Date().toISOString()}`; }
    }
    await writeFile(join(target, 'build-info.json'), JSON.stringify({ version, hasSite, siteVersion: hasSite ? siteVersion : null }) + '\n', { flag: 'wx' });
    return hasSite;
}

export async function downloadSite(temp, request = fetch) {
    // shortcut: kopia ekranu z master w chwili budowy serwera, zmiana samego ekranu jej nie odświeża; upgrade gdy ekran i serwer wdrażane razem
    const response = await request('https://codeload.github.com/oramm/ENVI.ProjectSite/tar.gz/master', { signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error('Nie udało się pobrać kodu ekranu.');
    const archive = join(temp, 'site.tar.gz');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: 'wx' }));
    execFileSync('tar', ['-xzf', 'site.tar.gz', '--strip-components=1', 'ENVI.ProjectSite-master/src'], { cwd: temp, timeout: 60000 });
    const sha = /\bcomment=([a-f0-9]{40})\n/i.exec(gunzipSync(await readFile(archive)).subarray(0, 1024).toString('utf8'))?.[1];
    return { siteRoot: temp, siteVersion: sha || `master z ${new Date().toISOString()}` };
}

async function main() {
    const version = process.env.HEROKU_SLUG_COMMIT || process.env.SOURCE_VERSION ||
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const configured = resolve(root, process.argv[2] || process.env.POMOC_SITE_DIR || '../pomoc-site');
    let siteRoot = (await lstat(join(configured, 'src')).catch(() => null))?.isDirectory() ? configured : undefined;
    let downloaded;
    let siteVersion;
    const staging = await mkdtemp(join(root, '.pomoc-src-'));
    try {
        if (!siteRoot && (process.env.SOURCE_VERSION || process.env.HEROKU_SLUG_COMMIT || process.env.DYNO)) {
            downloaded = await mkdtemp(join(tmpdir(), 'ps-pomoc-site-'));
            try { ({ siteRoot, siteVersion } = await downloadSite(downloaded)); }
            catch { console.warn('[pomoc] Pobranie publicznego kodu ekranu nie powiodło się.'); }
        }
        const hasSite = await snapshot(staging, { serverRoot: root, siteRoot, version, siteVersion });
        const target = join(root, '.pomoc-src');
        if ((await lstat(target).catch(() => null))?.isSymbolicLink()) throw new Error('Katalog kopii jest dowiązaniem.');
        await rm(target, { recursive: true, force: true });
        await rename(staging, target);
        console.log(`[pomoc] Kopia kodu PS ENVI ${version}, ekran: ${hasSite}.`);
    } finally {
        await rm(staging, { recursive: true, force: true });
        if (downloaded) await rm(downloaded, { recursive: true, force: true });
    }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(() => { console.error('[pomoc] Nie udało się utworzyć kopii kodu serwera.'); process.exitCode = 1; });
}
