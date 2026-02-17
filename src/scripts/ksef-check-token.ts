/**
 * Skrypt do weryfikacji tokena KSeF lokalnie.
 *
 * Użycie:
 *   yarn ts-node src/scripts/ksef-check-token.ts
 *   yarn ts-node src/scripts/ksef-check-token.ts --env production
 */

import { loadEnv } from '../setup/loadEnv';

loadEnv();

// Nadpisz KSEF_ENVIRONMENT PO loadEnv (loadEnv ignoruje shell env dla tej zmiennej)
const args = process.argv.slice(2);
const envOverrideIdx = args.indexOf('--env');
if (envOverrideIdx !== -1 && args[envOverrideIdx + 1]) {
    const overrideEnv = args[envOverrideIdx + 1];
    process.env.KSEF_ENVIRONMENT = overrideEnv;

    // Jeśli wymuszamy production — użyj KSEF_TOKEN_PRODUCTION jeśli dostępny
    if (overrideEnv === 'production' && process.env.KSEF_TOKEN_PRODUCTION) {
        process.env.KSEF_TOKEN = process.env.KSEF_TOKEN_PRODUCTION;
        console.log('[Override] KSEF_ENVIRONMENT=production, KSEF_TOKEN ← KSEF_TOKEN_PRODUCTION');
    } else {
        console.log(`[Override] KSEF_ENVIRONMENT=${overrideEnv}`);
    }
}

import Setup from '../setup/Setup';
import KsefService from '../invoices/KSeF/KsefService';

async function main() {
    console.log('\n=== KSeF Token Check ===\n');
    console.log('Środowisko KSeF:', Setup.KSeF.environment);
    console.log('API URL:        ', KsefService.getApiUrl());
    console.log('NIP:            ', Setup.KSeF.nip || '(brak)');
    console.log('Token:          ', Setup.KSeF.token ? `...${Setup.KSeF.token.slice(-6)}` : '(brak)');
    console.log('');

    try {
        KsefService.validateConfig();
    } catch (err: any) {
        console.error('❌ Błąd konfiguracji:', err.message);
        process.exit(1);
    }

    const service = new KsefService();

    try {
        console.log('→ Krok 1: Pobieranie challenge...');
        const { challenge, timestampMs } = await (service as any).getAuthChallenge();
        console.log('  challenge:', challenge.substring(0, 20) + '...');
        console.log('  timestamp:', timestampMs);
    } catch (err: any) {
        console.error('❌ Błąd /auth/challenge:', err.message);
        console.log('\nMożliwe przyczyny:');
        console.log('  - Brak dostępu do internetu lub URL API jest nieprawidłowy');
        console.log('  - KSeF API niedostępne');
        process.exit(1);
    }

    try {
        console.log('\n→ Krok 2: Uwierzytelnianie tokenem (auth + polling + redeem)...');
        await (service as any).authenticateWithKsefToken();
        console.log('\n✅ Token poprawny — uwierzytelnienie zakończone sukcesem!');
    } catch (err: any) {
        console.error('\n❌ Uwierzytelnienie nieudane:', err.message);
        if (err.message.includes('403')) {
            console.log('\nPrzyczyna: Token nieprawidłowy, wygasły lub NIP nie zgadza się z tokenem.');
            console.log('Rozwiązanie: Wygeneruj nowy token w portalu KSeF (https://ksef.mf.gov.pl)');
            console.log('             i zaktualizuj KSEF_TOKEN / KSEF_TOKEN_PRODUCTION w .env');
        } else if (err.message.includes('401')) {
            console.log('\nPrzyczyna: Brak autoryzacji (401).');
        } else if (err.message.includes('Timeout') || err.message.includes('ENOTFOUND')) {
            console.log('\nPrzyczyna: Problem z siecią lub URL API jest nieprawidłowy.');
        }
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Nieoczekiwany błąd:', err);
    process.exit(1);
});
