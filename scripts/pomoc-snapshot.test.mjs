import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { snapshot, allowedSource, sanitizeSource, downloadSite } from './pomoc-snapshot.mjs';

const emptyGitConfig = process.platform === 'win32' ? 'NUL' : '/dev/null';
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: emptyGitConfig, GIT_CONFIG_SYSTEM: emptyGitConfig };

test('lista dozwolona, sekrety, lokalny ekran i powtarzalna kopia', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ps-pomoc-snapshot-'));
    try {
        const serverRoot = join(root, 'server');
        const siteRoot = join(root, 'site');
        for (const path of ['server/src', 'site/src', 'server/src/__tests__', 'server/src/credentials']) await mkdir(join(root, path), { recursive: true });
        await writeFile(join(serverRoot, '.env.production'), 'SECRET=nie-kopiuj');
        await writeFile(join(serverRoot, 'src/.env'), 'SECRET=nie-kopiuj');
        await writeFile(join(serverRoot, 'src/__tests__/fixture.ts'), 'const osoba = "Prywatna osoba";');
        await writeFile(join(serverRoot, 'src/credentials/keys.ts'), 'const dane = "nie-kopiuj";');
        await writeFile(join(serverRoot, 'src/app.ts'), '// Prywatna osoba\nconst password = "nie-kopiuj"; const email = "osoba@example.invalid";');
        await writeFile(join(siteRoot, 'src/Menu.tsx'), 'export const menu = <button data-pomoc="case-add">Dodaj sprawę</button>;');
        execFileSync('git', ['init', '--quiet', siteRoot], { env: gitEnv });
        const siteSha = 'def5678' + 'a'.repeat(33);
        await writeFile(join(siteRoot, '.git/HEAD'), siteSha + '\n');
        // Junction katalogu działa na Windows bez uprawnień do tworzenia symlinków plików.
        await symlink(siteRoot, join(serverRoot, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
        const target = join(root, 'snapshot');
        await snapshot(target, { serverRoot, siteRoot, version: 'wersja-testowa' });
        const source = await readFile(join(target, 'server/src/app.ts'), 'utf8');
        assert.ok(!source.includes('nie-kopiuj') && !source.includes('Prywatna osoba') && !source.includes('osoba@example.invalid'));
        assert.deepEqual(await readdir(join(target, 'server/src')), ['app.ts']);
        assert.match(await readFile(join(target, 'site/src/Menu.tsx'), 'utf8'), /data-pomoc/);
        assert.equal(JSON.parse(await readFile(join(target, 'build-info.json'), 'utf8')).version, 'wersja-testowa');
        assert.equal(JSON.parse(await readFile(join(target, 'build-info.json'), 'utf8')).siteVersion, siteSha);
        await assert.rejects(snapshot(target, { serverRoot, siteRoot, version: 'test' }), /pusty/);
        await assert.rejects(snapshot(join(serverRoot, 'src'), { serverRoot, version: 'test' }), /źródeł/);
        const onlyServer = join(root, 'only-server');
        await snapshot(onlyServer, { serverRoot, siteRoot: join(root, 'missing'), version: 'test' });
        assert.equal(JSON.parse(await readFile(join(onlyServer, 'build-info.json'), 'utf8')).hasSite, false);
        await rm(join(siteRoot, '.git'), { recursive: true, force: true });
        await snapshot(join(root, 'no-site-sha'), { serverRoot, siteRoot, version: 'test' });
        assert.match(JSON.parse(await readFile(join(root, 'no-site-sha/build-info.json'), 'utf8')).siteVersion, /^master z \d{4}-\d\d-\d\dT/);
        for (const name of ['src/.env', 'src/example.test.ts', 'src/data/private.ts', 'src/scripts/private.ts', 'src/secret.json', 'src/key.pem']) assert.equal(allowedSource(name), false, name);
        assert.ok(!sanitizeSource('const apiKey = "sk-ant-abcdefghijklmnopqrstuvw";').includes('sk-ant-'));
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('tarball master dostarcza SHA z PAX bez gita/tokena przy pobieraniu, a bez SHA datę budowy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ps-pomoc-download-'));
    try {
        // Prawdziwy git archive ma ten sam nagłówek PAX co codeload; bez nowych commitów.
        const archive = execFileSync('git', ['archive', '--format=tar.gz', '--prefix=ENVI.ProjectSite-master/', 'HEAD', 'src/pomoc/store.ts'], { env: gitEnv });
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], { env: gitEnv, encoding: 'utf8' }).trim();
        for (const withSha of [true, false]) {
            const temp = join(root, String(withSha));
            await mkdir(temp);
            const payload = withSha ? archive : gzipSync(gunzipSync(archive).subarray(1024));
            const downloaded = await downloadSite(temp, async (url, init) => {
                assert.equal(url, 'https://codeload.github.com/oramm/ENVI.ProjectSite/tar.gz/master');
                assert.equal(init.headers, undefined);
                return new Response(payload);
            });
            assert.equal(downloaded.siteRoot, temp);
            if (withSha) assert.equal(downloaded.siteVersion, sha);
            else assert.match(downloaded.siteVersion, /^master z \d{4}-\d\d-\d\dT/);
            assert.match(await readFile(join(temp, 'src/pomoc/store.ts'), 'utf8'), /createUsageStore/);
            const target = join(root, `snapshot-${withSha}`);
            await snapshot(target, { serverRoot: temp, ...downloaded, version: 'test' });
            assert.equal(JSON.parse(await readFile(join(target, 'build-info.json'), 'utf8')).siteVersion, downloaded.siteVersion);
        }
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('wdrożenie wymaga ekranu na master, migracji produkcji, serwera i jednego procesu przed listą kont', async () => {
    const text = await readFile(new URL('../documentation/team/runbooks/pomoc-envi.md', import.meta.url), 'utf8');
    assert.match(text, /1\. Najpierw.*ekran.*master[\s\S]*2\. Następnie.*migrację na produkcji[\s\S]*3\. Potem wdróż serwer/);
    assert.match(text, /4\. Zanim.*POMOC_USERS.*jeden proces web/);
});
