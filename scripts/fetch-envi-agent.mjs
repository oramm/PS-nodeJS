import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'vendor');
const checkout = join(vendor, 'envi-agent');
function run(command, args, cwd = root) {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && command === 'yarn' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Polecenie ${command} zakończone błędem ${result.status}.`);
}
try {
    const version = readFileSync(join(root, 'envi-agent.version'), 'utf8').trim();
    if (!/^[a-f0-9]{7,40}$/i.test(version) && !/^[a-z0-9][a-z0-9._/-]*$/i.test(version)) throw new Error('Nieprawidłowa wersja ENVI Agenta.');
    mkdirSync(vendor, { recursive: true });
    // Usuwamy wyłącznie wygenerowany katalog vendor/envi-agent w tym repozytorium.
    rmSync(checkout, { recursive: true, force: true });
    run('git', ['-c', 'core.autocrlf=false', 'clone', '--no-checkout', '--no-hardlinks', '--', process.env.ENVI_AGENT_SOURCE || 'git@github.com:envi-konsulting/envi-agent.git', checkout]);
    run('git', ['checkout', '--detach', version], checkout);
    const source = join(checkout, 'server');
    run('yarn', ['pack', '--ignore-scripts', '--filename', join(vendor, 'envi-agent-server.tgz')], source);
} catch (error) {
    console.error(`ENVI Agent: ${error.message}`);
    process.exitCode = 1;
}
