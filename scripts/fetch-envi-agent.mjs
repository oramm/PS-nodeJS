import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'vendor');
const checkout = join(vendor, 'envi-agent');
const { values } = parseArgs({ options: {
    'allowed-collection': { type: 'string' },
    outfile: { type: 'string' },
} });

function run(command, args, cwd = root, capture = false) {
    const result = spawnSync(command, args, { cwd, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status}).`);
    return result.stdout?.trim();
}

function npm(args, cwd) {
    // Windows cannot spawn npm.cmd directly without a shell; invoke its JS entry point.
    return process.platform === 'win32'
        ? run(process.execPath, [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args], cwd)
        : run('npm', args, cwd);
}

try {
    const version = readFileSync(join(root, 'envi-agent.version'), 'utf8').trim();
    if (!version) throw new Error('envi-agent.version must contain a Git tag or a commit SHA.');
    const commit = /^[a-f0-9]{7,40}$/i.test(version);
    const revision = commit ? version : `refs/tags/${version}`;
    if (!commit) run('git', ['check-ref-format', revision]);
    if (values.outfile && !values['allowed-collection']) throw new Error('--outfile requires --allowed-collection.');
    const source = process.env.ENVI_AGENT_SOURCE || 'git@github.com:envi-konsulting/envi-agent.git';
    mkdirSync(vendor, { recursive: true });
    // Generated checkout only: never install or build in the source repository.
    rmSync(checkout, { recursive: true, force: true });
    run('git', ['-c', 'core.autocrlf=false', 'clone', '--no-checkout', '--no-hardlinks', '--', source, checkout]);
    run('git', ['-c', 'core.autocrlf=false', 'checkout', '--detach', revision], checkout);
    console.log(`ENVI Agent: ${run('git', ['rev-parse', 'HEAD'], checkout, true)}`);
    const panel = join(checkout, 'panel');
    npm(['ci', '--no-audit', '--no-fund'], panel); // prepare builds dist before FIDman's npm ci.
    const manifest = JSON.parse(readFileSync(join(panel, 'package.json'), 'utf8'));
    npm(['pack', '--ignore-scripts', '--pack-destination', vendor], panel);
    renameSync(join(vendor, `envi-agent-panel-${manifest.version}.tgz`), join(vendor, 'envi-agent-panel.tgz'));
    const server = join(checkout, 'server');
    const serverManifest = JSON.parse(readFileSync(join(server, 'package.json'), 'utf8'));
    npm(['pack', '--ignore-scripts', '--pack-destination', vendor], server);
    renameSync(join(vendor, `envi-agent-server-${serverManifest.version}.tgz`), join(vendor, 'envi-agent-server.tgz'));
    if (values['allowed-collection']) {
        npm(['ci', '--no-audit', '--no-fund'], checkout);
        const outfile = resolve(values.outfile || join(root, 'dist/envi-agent.zip'));
        run('pwsh', ['-NoProfile', '-File', join(checkout, 'build-package.ps1'),
            '-AllowedCollections', values['allowed-collection'], '-OutFile', outfile]);
        run('pwsh', ['-NoProfile', '-File', join(root, 'scripts/verify-envi-agent-package.ps1'),
            '-Package', outfile, '-Source', join(checkout, 'envi-agent.ps1'), '-Collection', values['allowed-collection']]);
    }
} catch (error) {
    console.error(`ENVI Agent: ${error.message}`);
    process.exitCode = 1;
}
