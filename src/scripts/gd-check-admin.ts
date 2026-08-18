/**
 * Czy konto z REFRESH_TOKEN ma uprawnienia administratora domeny w kontekście Drive?
 * Test: drives.list z useDomainAdminAccess. Admin zobaczy WSZYSTKIE dyski
 * współdzielone w domenie, zwykłe konto dostanie 403.
 *
 * W 100% READ-ONLY.
 */
import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google } from 'googleapis';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';

async function main() {
    oAuthClient.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
    await oAuthClient.getAccessToken();
    const drive = google.drive({ version: 'v3', auth: oAuthClient });

    const me = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
    console.log(`Konto master: ${me.data.user?.emailAddress}`);

    const normal = await drive.drives.list({ pageSize: 100, fields: 'drives(id,name)' });
    console.log(`\nBez admina: ${normal.data.drives?.length ?? 0} dysków współdzielonych`);
    for (const d of normal.data.drives ?? []) console.log(`  - ${d.name}`);

    try {
        const admin = await drive.drives.list({
            pageSize: 100,
            fields: 'drives(id,name)',
            useDomainAdminAccess: true,
        });
        console.log(
            `\nZ useDomainAdminAccess: ${admin.data.drives?.length ?? 0} dysków — KONTO MA PRAWA ADMINA`
        );
        for (const d of admin.data.drives ?? []) console.log(`  - ${d.name} (${d.id})`);
    } catch (e: any) {
        console.log(
            `\nZ useDomainAdminAccess: ODMOWA (${e?.response?.status}) — konto NIE jest administratorem domeny`
        );
        console.log(`  ${e?.errors?.[0]?.message ?? e?.message}`);
    }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
