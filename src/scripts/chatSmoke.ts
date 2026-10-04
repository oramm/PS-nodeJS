/**
 * Smoke test Google Chat: zakłada pokój bez członków, czyta, usuwa, sprawdza listą.
 * Użycie: npx ts-node src/scripts/chatSmoke.ts
 */
import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { randomUUID } from 'crypto';
import ToolsChat from '../setup/Sessions/ToolsChat';

async function main() {
    const created = await ToolsChat.createSpaceWithMembers(
        'TEST CHT-1 - do skasowania',
        [],
        randomUUID()
    );
    console.log('create:', JSON.stringify(created));
    const got = await ToolsChat.getSpace(created.name);
    console.log('get:', got.name, got.displayName, got.spaceUri);
    await ToolsChat.deleteSpace(created.name);
    console.log('delete: ok');
    const spaces = await ToolsChat.listSpaces();
    const still = spaces.some((s) => s.name === created.name);
    console.log(`list: ${spaces.length} pokoi, usuniety obecny: ${still}`);
    if (still) process.exitCode = 1;
}

main().catch((e) => {
    console.error('BLAD:', e instanceof Error ? e.message : e);
    process.exit(1);
});
