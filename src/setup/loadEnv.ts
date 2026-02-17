import dotenv from 'dotenv';
import path from 'path';

export function loadEnv(): void {
    const shellEnv = { ...process.env };

    const rootEnv = dotenv.config();
    const rootKsefEnvironment = rootEnv.parsed?.KSEF_ENVIRONMENT?.trim();
    const nodeEnv = process.env.NODE_ENV || 'production';
    const envFile = path.resolve(process.cwd(), `.env.${nodeEnv}`);
    dotenv.config({ path: envFile, override: true });

    Object.entries(shellEnv).forEach(([key, value]) => {
        if (key !== 'KSEF_ENVIRONMENT' && value !== undefined) {
            process.env[key] = value;
        }
    });

    if (rootKsefEnvironment) {
        process.env.KSEF_ENVIRONMENT = rootKsefEnvironment;
    }

    const ksefEnvironment = process.env.KSEF_ENVIRONMENT || 'test';
    const isProductionKsef = ksefEnvironment === 'production';
    const testToken = process.env.KSEF_TOKEN?.trim();
    const productionToken = process.env.KSEF_TOKEN_PRODUCTION?.trim();
    let ksefTokenSource: 'missing' | 'KSEF_TOKEN' | 'KSEF_TOKEN_PRODUCTION' =
        'missing';

    if (isProductionKsef) {
        if (productionToken) {
            process.env.KSEF_TOKEN = productionToken;
            ksefTokenSource = 'KSEF_TOKEN_PRODUCTION';
        } else if (testToken) {
            process.env.KSEF_TOKEN = testToken;
            ksefTokenSource = 'KSEF_TOKEN';
        }
    } else if (testToken) {
        process.env.KSEF_TOKEN = testToken;
        ksefTokenSource = 'KSEF_TOKEN';
    }

    const ksefApiOverride = process.env.KSEF_API_BASE_URL?.trim();
    const ksefApiBaseUrl = ksefApiOverride
        ? ksefApiOverride.replace(/\/+$/, '')
        : ksefEnvironment === 'production'
          ? 'https://api.ksef.mf.gov.pl/v2'
          : 'https://api-test.ksef.mf.gov.pl/v2';

    console.log(`[ENV] Environment: ${nodeEnv}`);
    console.log(
        `[ENV] DB target: ${process.env.DB_HOST}/${process.env.DB_NAME}`,
    );
    console.log(`[ENV] KSeF environment: ${ksefEnvironment}`);
    if (ksefTokenSource === 'missing') {
        console.warn(
            '[ENV] ⚠ KSeF token source: missing — operacje KSeF będą zwracać błędy',
        );
    } else if (ksefTokenSource === 'KSEF_TOKEN_PRODUCTION') {
        console.log('[ENV] KSeF token source: KSEF_TOKEN_PRODUCTION');
    } else {
        console.log('[ENV] KSeF token source: KSEF_TOKEN');
    }
    console.log(
        `[ENV] KSeF API: ${ksefApiBaseUrl}${ksefApiOverride ? ' (override)' : ''}`,
    );
}
