import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { snapshot, allowedSource, sanitizeSource } from './pomoc-snapshot.mjs';

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
        // Junction katalogu działa na Windows bez uprawnień do tworzenia symlinków plików.
        await symlink(siteRoot, join(serverRoot, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
        const target = join(root, 'snapshot');
        await snapshot(target, { serverRoot, siteRoot, version: 'wersja-testowa' });
        const source = await readFile(join(target, 'server/src/app.ts'), 'utf8');
        assert.ok(!source.includes('nie-kopiuj') && !source.includes('Prywatna osoba') && !source.includes('osoba@example.invalid'));
        assert.deepEqual(await readdir(join(target, 'server/src')), ['app.ts']);
        assert.match(await readFile(join(target, 'site/src/Menu.tsx'), 'utf8'), /data-pomoc/);
        assert.equal(JSON.parse(await readFile(join(target, 'build-info.json'), 'utf8')).version, 'wersja-testowa');
        await assert.rejects(snapshot(target, { serverRoot, siteRoot, version: 'test' }), /pusty/);
        await assert.rejects(snapshot(join(serverRoot, 'src'), { serverRoot, version: 'test' }), /źródeł/);
        const onlyServer = join(root, 'only-server');
        await snapshot(onlyServer, { serverRoot, siteRoot: join(root, 'missing'), version: 'test' });
        assert.equal(JSON.parse(await readFile(join(onlyServer, 'build-info.json'), 'utf8')).hasSite, false);
        for (const name of ['src/.env', 'src/example.test.ts', 'src/data/private.ts', 'src/scripts/private.ts', 'src/secret.json', 'src/key.pem']) assert.equal(allowedSource(name), false, name);
        assert.ok(!sanitizeSource('const apiKey = "sk-ant-abcdefghijklmnopqrstuvw";').includes('sk-ant-'));
    } finally { await rm(root, { recursive: true, force: true }); }
});
