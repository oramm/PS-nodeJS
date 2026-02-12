import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import Setup from '../../setup/Setup';

// ==================== INTERFEJSY API KSeF ====================

/** Certyfikat publiczny KSeF */
interface KsefCertificate {
    certificate: string;
    usage: string[];
    validFrom?: string;
    validTo?: string;
}

/** Odpowiedź z wysłania faktury */
interface SendInvoiceResponse {
    referenceNumber: string;
    invoiceReferenceNumber?: string;
    timestamp?: string;
}

/** Status sesji */
interface SessionStatusResponse {
    referenceNumber: string;
    status: {
        code: number;
        description?: string;
    };
    invoicesCount?: number;
    creationTimestamp?: string;
}

/** Status faktury */
interface InvoiceStatusResponse {
    referenceNumber: string;
    ksefReferenceNumber?: string;
    ksefNumber?: string;
    status: {
        code: number;
        description?: string;
        details?: string[];
    };
    upoDownloadUrl?: string;
    upoDownloadUrlExpirationDate?: string;
    acquisitionTimestamp?: string;
    acquisitionDate?: string;
    invoicingDate?: string;
    permanentStorageDate?: string;
}

/** Szczegóły faktury */
interface InvoiceDetailsResponse {
    ksefReferenceNumber: string;
    invoiceHash?: string;
    invoiceReferenceNumber?: string;
    invoiceXml?: string;
    subjectName?: string;
    subjectNip?: string;
    invoiceType?: string;
    invoicingDate?: string;
    acquisitionTimestamp?: string;
}

/**
 * KSeF API 2.0 Service
 *
 * Implementacja zgodna z nowym API KSeF 2.0 (od 30.09.2025)
 * Dokumentacja: https://github.com/CIRFMF/ksef-docs
 *
 * Proces uwierzytelniania:
 * 1. POST /auth/challenge - pobierz challenge
 * 2. POST /auth/ksef-token - autoryzacja zaszyfrowanym tokenem KSeF
 * 3. Odpowiedź zawiera accessToken (JWT) do dalszych operacji
 *
 * Proces wysyłki faktur:
 * 1. POST /sessions/online - otwórz sesję (z zaszyfrowanym kluczem AES)
 * 2. PUT /sessions/{ref}/invoices - wyślij fakturę (zaszyfrowaną AES)
 * 3. POST /sessions/online/{ref}/close - zamknij sesję
 */
export default class KsefService {
    private baseURL: string;

    // Token JWT do autoryzacji (z procesu uwierzytelniania)
    private accessToken: string | null = null;

    // Refresh token do odświeżania accessToken
    private refreshToken: string | null = null;

    // Klucz AES do szyfrowania faktur (generowany per sesja)
    private aesKey: Buffer | null = null;
    private aesIv: Buffer | null = null;

    // Numer referencyjny aktywnej sesji wysyłki
    private sessionReferenceNumber: string | null = null;

    constructor() {
        this.baseURL = KsefService.getApiUrl();
        KsefService.validateConfig();
    }

    // ==================== KONFIGURACJA (z Setup.KSeF) ====================

    /**
     * Zwraca URL API KSeF na podstawie środowiska
     */
    static getApiUrl(): string {
        return Setup.KSeF.environment === 'production'
            ? 'https://ksef.mf.gov.pl/api'
            : 'https://ksef-test.mf.gov.pl/api';
    }

    /**
     * Waliduje konfigurację KSeF
     * @throws Error jeśli konfiguracja niepoprawna
     */
    static validateConfig(): void {
        const { nip, token, environment } = Setup.KSeF;

        if (!nip || !/^\d{10}$/.test(nip)) {
            throw new Error('KSEF_NIP must be 10 digits (no dashes)');
        }
        if (!token) {
            throw new Error('KSEF_TOKEN is required');
        }
        if (!['test', 'production'].includes(environment)) {
            throw new Error('KSEF_ENVIRONMENT must be "test" or "production"');
        }
    }

    /**
     * Zwraca NIP z konfiguracji
     */
    static getNip(): string {
        return Setup.KSeF.nip || '';
    }

    /**
     * Zwraca token z konfiguracji
     */
    static getToken(): string {
        return Setup.KSeF.token || '';
    }

    /**
     * Fetch z retry logic dla błędów 5xx i problemów sieciowych
     * Exponential backoff: 1s, 2s, 4s...
     */
    private async fetchWithRetry(
        url: string,
        options: RequestInit,
        maxRetries = 3,
    ): Promise<Response> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);

                // Retry tylko dla błędów 5xx (serwer)
                if (response.status >= 500 && attempt < maxRetries - 1) {
                    const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                    console.log(
                        `   [HTTP] Błąd ${response.status}, retry za ${delayMs}ms (próba ${attempt + 1}/${maxRetries})`,
                    );
                    await this.sleep(delayMs);
                    continue;
                }

                return response;
            } catch (err: any) {
                lastError = err;

                // Retry dla błędów sieciowych i timeout
                const isRetryable =
                    err.name === 'TimeoutError' ||
                    err.name === 'AbortError' ||
                    err.code === 'ECONNRESET' ||
                    err.code === 'ENOTFOUND' ||
                    err.code === 'ETIMEDOUT';

                if (isRetryable && attempt < maxRetries - 1) {
                    const delayMs = Math.pow(2, attempt) * 1000;
                    console.log(
                        `   [HTTP] ${err.name || err.code}, retry za ${delayMs}ms (próba ${attempt + 1}/${maxRetries})`,
                    );
                    await this.sleep(delayMs);
                    continue;
                }

                throw err;
            }
        }

        throw lastError || new Error('Retry failed');
    }

    private async requestJson<T>(
        method: 'GET' | 'POST' | 'PUT',
        path: string,
        body?: unknown,
        headers: Record<string, string> = {},
        timeoutMs = 60000,
    ): Promise<T> {
        const url = `${this.baseURL}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await this.fetchWithRetry(url, {
                method,
                headers: {
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                    ...headers,
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(
                    `KSeF HTTP ${response.status} ${response.statusText}: ${text}`,
                );
            }

            // Obsługa pustych odpowiedzi (204 No Content lub pusta odpowiedź 200)
            const contentLength = response.headers.get('content-length');
            if (contentLength === '0' || response.status === 204) {
                return {} as T;
            }

            const text = await response.text();
            if (!text || text.trim().length === 0) {
                return {} as T;
            }

            return JSON.parse(text) as T;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async requestArrayBuffer(
        path: string,
        headers: Record<string, string> = {},
        timeoutMs = 60000,
    ): Promise<Buffer> {
        const url = `${this.baseURL}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await this.fetchWithRetry(url, {
                method: 'GET',
                headers,
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(
                    `KSeF HTTP ${response.status} ${response.statusText}: ${text}`,
                );
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // ==================== UWIERZYTELNIANIE (KSeF 2.0) ====================

    /**
     * Krok 1: Pobierz challenge do uwierzytelnienia
     * POST /auth/challenge
     *
     * Odpowiedź zawiera:
     * - challenge: string - identyfikator challenge
     * - timestamp: string - timestamp ISO
     * - timestampMs: number - timestamp w milisekundach (używamy tego!)
     */
    async getAuthChallenge(): Promise<{
        challenge: string;
        timestampMs: number;
    }> {
        console.log('   [Auth] Pobieranie challenge...');

        const { challenge, timestampMs } = await this.requestJson<{
            challenge: string;
            timestampMs: number;
        }>('POST', '/auth/challenge', {});
        console.log(
            '   [Auth] Otrzymano challenge:',
            challenge.substring(0, 20) + '...',
        );
        console.log('   [Auth] Timestamp (ms):', timestampMs);

        return { challenge, timestampMs };
    }

    /**
     * Krok 2: Uwierzytelnienie tokenem KSeF
     * POST /auth/ksef-token
     *
     * Token musi być zaszyfrowany RSA-OAEP SHA-256 w formacie: {token}|{timestampMs}
     */
    async authenticateWithKsefToken(): Promise<string> {
        const ksefToken = KsefService.getToken();
        const nip = KsefService.getNip();

        if (!ksefToken || !nip) {
            throw new Error('Brak KSEF_TOKEN lub KSEF_NIP w .env');
        }

        console.log('   [Auth] Uwierzytelnianie tokenem KSeF...');

        // 1. Pobierz challenge
        const { challenge, timestampMs } = await this.getAuthChallenge();

        // 2. Pobierz certyfikaty KSeF (jeśli nie mamy)
        if (!this.ksefTokenEncryptionCert) {
            await this.fetchPublicKeys();
        }

        // 3. Przygotuj i zaszyfruj token: {token}|{timestampMs}
        // WAŻNE: timestampMs musi być liczbą (milisekundy), nie stringiem ISO!
        const tokenWithTimestamp = `${ksefToken}|${timestampMs}`;
        console.log(
            '   [Auth] Token do szyfrowania (długość):',
            tokenWithTimestamp.length,
            'znaków',
        );

        const encryptedToken = this.encryptKsefToken(tokenWithTimestamp);

        // 4. Wyślij żądanie uwierzytelnienia
        const requestBody = {
            challenge: challenge,
            contextIdentifier: {
                type: 'Nip',
                value: nip,
            },
            encryptedToken: encryptedToken,
        };

        const authResponse = await this.requestJson<{
            referenceNumber: string;
            authenticationToken?: { token?: string };
        }>('POST', '/auth/ksef-token', requestBody);

        // 5. Pobierz authenticationToken (potrzebny do pollingu)
        const authReferenceNumber = authResponse.referenceNumber;
        const authenticationToken = authResponse.authenticationToken?.token;

        if (!authenticationToken) {
            throw new Error(
                'Nie otrzymano authenticationToken z odpowiedzi /auth/ksef-token',
            );
        }

        console.log(
            '   [Auth] Operacja uwierzytelnienia:',
            authReferenceNumber,
        );

        // 6. Poczekaj na zakończenie uwierzytelnienia (polling)
        await this.pollAuthStatus(authReferenceNumber, authenticationToken);

        // 7. Pobierz tokeny dostępu (accessToken + refreshToken)
        this.accessToken = await this.redeemTokens(authenticationToken);

        console.log(
            '   [Auth] ✅ Uwierzytelnienie zakończone, otrzymano accessToken',
        );
        return this.accessToken;
    }

    /**
     * Polling statusu uwierzytelnienia
     * GET /auth/{referenceNumber}
     * Wymaga AuthenticationToken jako Bearer
     */
    private async pollAuthStatus(
        referenceNumber: string,
        authenticationToken: string,
        maxAttempts = 30,
    ): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            const response = await this.requestJson<{
                status?: {
                    code?: number;
                    description?: string;
                    details?: string[];
                };
            }>('GET', `/auth/${referenceNumber}`, undefined, {
                Authorization: `Bearer ${authenticationToken}`,
            });

            const statusCode = response.status?.code;
            const statusDesc = response.status?.description || '';
            console.log(
                `   [Auth] Status: ${statusCode} - ${statusDesc} (próba ${i + 1}/${maxAttempts})`,
            );

            if (statusCode === 200) {
                // Uwierzytelnienie zakończone sukcesem
                return;
            }

            if (typeof statusCode === 'number' && statusCode >= 400) {
                const details =
                    response.status?.details?.join(', ') || statusDesc;
                throw new Error(
                    `Błąd uwierzytelnienia (${statusCode}): ${details}`,
                );
            }

            // Status 100 = w toku - czekamy
            await this.sleep(1000);
        }

        throw new Error(
            'Timeout uwierzytelnienia - przekroczono maksymalną liczbę prób',
        );
    }

    /**
     * Pobranie tokenów dostępu po pomyślnym uwierzytelnieniu
     * POST /auth/token/redeem
     * Wymaga AuthenticationToken jako Bearer
     * Zwraca accessToken i refreshToken
     */
    private async redeemTokens(authenticationToken: string): Promise<string> {
        console.log('   [Auth] Pobieranie tokenów dostępu...');

        const response = await this.requestJson<{
            accessToken?: { token?: string };
            refreshToken?: { token?: string };
        }>(
            'POST',
            '/auth/token/redeem',
            {},
            {
                Authorization: `Bearer ${authenticationToken}`,
            },
        );

        const accessToken = response.accessToken?.token;
        const refreshToken = response.refreshToken?.token;

        if (!accessToken) {
            throw new Error('Nie otrzymano accessToken z /auth/token/redeem');
        }

        // Zapisz refresh token na przyszłość (opcjonalne)
        this.refreshToken = refreshToken ?? null;

        console.log('   [Auth] ✅ Otrzymano accessToken i refreshToken');
        return accessToken;
    }

    /**
     * Pobierz certyfikaty publiczne KSeF do szyfrowania
     * GET /security/public-key-certificates
     *
     * Zwraca certyfikaty z różnym usage:
     * - KsefTokenEncryption: do szyfrowania tokena KSeF
     * - SymmetricKeyEncryption: do szyfrowania klucza AES
     */
    private ksefTokenEncryptionCert: string | null = null;
    private symmetricKeyEncryptionCert: string | null = null;
    
    // Statyczny cache dla certyfikatów (współdzielony między instancjami)
    private static cachedTokenCert: string | null = null;
    private static cachedAesCert: string | null = null;
    private static certCacheExpiry: number = 0;

    private async fetchPublicKeys(): Promise<void> {
        // Sprawdź cache (certyfikaty ważne 1 godzinę)
        const now = Date.now();
        if (KsefService.cachedTokenCert && KsefService.cachedAesCert && now < KsefService.certCacheExpiry) {
            console.log('   [Auth] ✅ Użyto certyfikatów z cache');
            this.ksefTokenEncryptionCert = KsefService.cachedTokenCert;
            this.symmetricKeyEncryptionCert = KsefService.cachedAesCert;
            return;
        }
        
        console.log('   [Auth] Pobieranie certyfikatów KSeF...');

        const certificates = await this.requestJson<KsefCertificate[]>(
            'GET',
            '/security/public-key-certificates',
        );

        if (!Array.isArray(certificates) || certificates.length === 0) {
            throw new Error('Nie otrzymano listy certyfikatów z KSeF');
        }

        // Znajdź certyfikat do szyfrowania tokenów
        const tokenCert = certificates.find(
            (c) => c.usage && c.usage.includes('KsefTokenEncryption'),
        );
        if (!tokenCert) {
            throw new Error('Nie znaleziono certyfikatu KsefTokenEncryption');
        }
        this.ksefTokenEncryptionCert = tokenCert.certificate;

        // Znajdź certyfikat do szyfrowania klucza AES
        const aesCert = certificates.find(
            (c) => c.usage && c.usage.includes('SymmetricKeyEncryption'),
        );
        if (!aesCert) {
            throw new Error(
                'Nie znaleziono certyfikatu SymmetricKeyEncryption',
            );
        }
        this.symmetricKeyEncryptionCert = aesCert.certificate;
        
        // Zapisz do cache (ważne 1 godzinę)
        KsefService.cachedTokenCert = this.ksefTokenEncryptionCert;
        KsefService.cachedAesCert = this.symmetricKeyEncryptionCert;
        KsefService.certCacheExpiry = now + 3600000; // 1h

        console.log('   [Auth] ✅ Pobrano certyfikaty KSeF');
    }

    /**
     * Szyfrowanie RSA-OAEP SHA-256 przy użyciu certyfikatu X.509
     */
    private encryptWithCertificate(
        plaintext: string,
        certBase64: string,
    ): string {
        // Certyfikat jest w Base64 DER, konwertuj do prawidłowego formatu PEM
        // PEM wymaga podziału na linie po 64 znaki
        const certLines = certBase64.match(/.{1,64}/g) || [];
        const pemCert = `-----BEGIN CERTIFICATE-----\n${certLines.join('\n')}\n-----END CERTIFICATE-----`;

        // Wyciągnij klucz publiczny z certyfikatu X.509
        const publicKey = crypto.createPublicKey({
            key: pemCert,
            format: 'pem',
        });

        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256',
            },
            Buffer.from(plaintext, 'utf-8'),
        );

        return encrypted.toString('base64');
    }

    /**
     * Szyfrowanie tokena KSeF algorytmem RSA-OAEP SHA-256
     */
    private encryptKsefToken(tokenWithTimestamp: string): string {
        if (!this.ksefTokenEncryptionCert) {
            throw new Error('Brak certyfikatu do szyfrowania tokena');
        }
        return this.encryptWithCertificate(
            tokenWithTimestamp,
            this.ksefTokenEncryptionCert,
        );
    }

    /**
     * Szyfrowanie klucza AES algorytmem RSA-OAEP SHA-256
     * Przyjmuje surowe bajty klucza AES (nie Base64)
     */
    private encryptAesKeyRaw(aesKey: Buffer): string {
        if (!this.symmetricKeyEncryptionCert) {
            throw new Error('Brak certyfikatu do szyfrowania klucza AES');
        }

        // Certyfikat jest w Base64 DER, konwertuj do prawidłowego formatu PEM
        const certLines =
            this.symmetricKeyEncryptionCert.match(/.{1,64}/g) || [];
        const pemCert = `-----BEGIN CERTIFICATE-----\n${certLines.join('\n')}\n-----END CERTIFICATE-----`;

        // Wyciągnij klucz publiczny z certyfikatu X.509
        const publicKey = crypto.createPublicKey({
            key: pemCert,
            format: 'pem',
        });

        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256',
            },
            aesKey, // Surowe bajty, nie Base64!
        );

        return encrypted.toString('base64');
    }

    /**
     * Szyfrowanie klucza AES algorytmem RSA-OAEP SHA-256
     * @deprecated Użyj encryptAesKeyRaw zamiast tego
     */
    private encryptAesKey(aesKeyBase64: string): string {
        if (!this.symmetricKeyEncryptionCert) {
            throw new Error('Brak certyfikatu do szyfrowania klucza AES');
        }
        return this.encryptWithCertificate(
            aesKeyBase64,
            this.symmetricKeyEncryptionCert,
        );
    }

    // ==================== SESJA WYSYŁKI (KSeF 2.0) ====================

    // Konfiguracja schematu FA(3) - obowiązuje od 01.09.2025
    private static readonly FORM_CODE = {
        systemCode: 'FA (3)',
        schemaVersion: '1-0E',
        value: 'FA',
    };

    /**
     * Otwórz sesję interaktywną
     * POST /sessions/online
     *
     * Wymaga zaszyfrowanego klucza AES do szyfrowania faktur
     *
     * Request body:
     * {
     *   formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
     *   encryption: { encryptedSymmetricKey: "...", initializationVector: "..." }
     * }
     */
    async openSession(): Promise<string> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        console.log(
            `   [Session] Otwieranie sesji interaktywnej (schemat: ${KsefService.FORM_CODE.systemCode})...`,
        );

        // Generuj klucz AES-256 i IV dla tej sesji
        this.aesKey = crypto.randomBytes(32); // 256 bits
        this.aesIv = crypto.randomBytes(16); // 128 bits

        // Pobierz certyfikaty jeśli nie mamy
        if (!this.symmetricKeyEncryptionCert) {
            await this.fetchPublicKeys();
        }

        // Zaszyfruj klucz AES certyfikatem RSA-OAEP
        // UWAGA: Szyfrujemy surowe bajty klucza, nie Base64!
        const encryptedAesKey = this.encryptAesKeyRaw(this.aesKey);

        const requestBody = {
            formCode: KsefService.FORM_CODE,
            encryption: {
                encryptedSymmetricKey: encryptedAesKey,
                initializationVector: this.aesIv.toString('base64'),
            },
        };

        const response = await this.requestJson<{ referenceNumber: string }>(
            'POST',
            '/sessions/online',
            requestBody,
            { Authorization: `Bearer ${this.accessToken}` },
        );

        this.sessionReferenceNumber = response.referenceNumber;
        console.log(
            '   [Session] ✅ Sesja otwarta:',
            this.sessionReferenceNumber,
        );

        return this.sessionReferenceNumber!;
    }

    /**
     * Wysyłka faktury w ramach sesji interaktywnej
     * POST /sessions/online/{referenceNumber}/invoices
     *
     * Faktura musi być zaszyfrowana AES-256-CBC
     * Request body zawiera metadane i zaszyfrowaną treść
     */
    async submitInvoice(xml: string, isCorrectionInvoice: boolean = false): Promise<any> {
        if (!this.sessionReferenceNumber) {
            await this.openSession();
        }

        console.log(`   [Send] ${isCorrectionInvoice ? 'Szyfrowanie i wysyłka korekty' : 'Szyfrowanie i wysyłka faktury'}...`);

        // Konwertuj XML do bajtów
        const invoiceBytes = Buffer.from(xml, 'utf-8');

        // Zaszyfruj XML faktury algorytmem AES-256-CBC
        const encryptedInvoice = this.encryptWithAES(xml);

        // Oblicz hash SHA-256 oryginalnej faktury
        const invoiceHash = crypto
            .createHash('sha256')
            .update(invoiceBytes)
            .digest('base64');
        const invoiceSize = invoiceBytes.length;

        // Oblicz hash SHA-256 zaszyfrowanej faktury
        const encryptedInvoiceHash = crypto
            .createHash('sha256')
            .update(encryptedInvoice)
            .digest('base64');
        const encryptedInvoiceSize = encryptedInvoice.length;

        // Przygotuj request body zgodnie z SendInvoiceRequest
        const requestBody = {
            invoiceHash: invoiceHash,
            invoiceSize: invoiceSize,
            encryptedInvoiceHash: encryptedInvoiceHash,
            encryptedInvoiceSize: encryptedInvoiceSize,
            encryptedInvoiceContent: encryptedInvoice.toString('base64'),
            offlineMode: false,
        };

        console.log(
            '   [Send] Invoice size:',
            invoiceSize,
            'Encrypted size:',
            encryptedInvoiceSize,
        );

        const response = await this.requestJson<SendInvoiceResponse>(
            'POST',
            `/sessions/online/${this.sessionReferenceNumber}/invoices`,
            requestBody,
            { Authorization: `Bearer ${this.accessToken}` },
        );

        const logType = isCorrectionInvoice ? 'Korekta wysłana' : 'Faktura wysłana';
        console.log(`   [Send] ✅ ${logType}, referenceNumber:`, response.invoiceReferenceNumber || response.referenceNumber);
        return response;
    }

    /**
     * Szyfrowanie AES-256-CBC z PKCS#7 padding
     *
     * Zgodnie z dokumentacją KSeF API 2.0:
     * - Klucz symetryczny: 256 bitów (przekazany przy otwieraniu sesji)
     * - IV: 128 bitów (przekazany przy otwieraniu sesji - NIE dołączamy do szyfrogramu!)
     * - Padding: PKCS#7
     *
     * UWAGA: W API 2.0 IV jest przekazywany osobno przy otwieraniu sesji (initializationVector),
     * więc NIE dodajemy go jako prefix do zaszyfrowanych danych faktury!
     */
    private encryptWithAES(plaintext: string): Buffer {
        if (!this.aesKey || !this.aesIv) {
            throw new Error('Brak klucza AES - najpierw otwórz sesję');
        }

        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            this.aesKey,
            this.aesIv,
        );
        cipher.setAutoPadding(true); // PKCS#7 padding

        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf-8'),
            cipher.final(),
        ]);

        // W API 2.0 NIE dodajemy IV jako prefix - IV jest przekazany przy otwieraniu sesji
        return encrypted;
    }

    /**
     * Sprawdzenie statusu sesji
     * GET /sessions/{referenceNumber}
     */
    async getSessionStatus(): Promise<SessionStatusResponse> {
        if (!this.sessionReferenceNumber || !this.accessToken) {
            throw new Error('Brak aktywnej sesji');
        }

        return await this.requestJson<SessionStatusResponse>(
            'GET',
            `/sessions/${this.sessionReferenceNumber}`,
            undefined,
            { Authorization: `Bearer ${this.accessToken}` },
        );
    }

    /**
     * Sprawdzenie statusu faktury
     * GET /sessions/{sessionReferenceNumber}/invoices/{invoiceReferenceNumber}
     *
     * UWAGA: Wymaga autoryzacji, ale sesja wysyłki może być już zamknięta.
     * Ten endpoint pozwala sprawdzić status faktury wysłanej w DOWOLNEJ sesji
     * używając numeru referencyjnego sesji i faktury.
     *
     * @param invoiceReferenceNumber - numer referencyjny faktury (z wysyłki)
     * @param sessionReferenceNumber - numer referencyjny sesji (opcjonalny, użyje bieżącej jeśli nie podany)
     */
    async getInvoiceStatus(
        invoiceReferenceNumber: string,
        sessionReferenceNumber?: string,
    ): Promise<InvoiceStatusResponse> {
        // Upewnij się że mamy token autoryzacji
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        // Użyj przekazanej sesji lub bieżącej
        const sessionRef =
            sessionReferenceNumber || this.sessionReferenceNumber;
        if (!sessionRef) {
            throw new Error(
                'Brak numeru referencyjnego sesji - podaj sessionReferenceNumber',
            );
        }

        const response = await this.requestJson<InvoiceStatusResponse>(
            'GET',
            `/sessions/${sessionRef}/invoices/${invoiceReferenceNumber}`,
            undefined,
            {
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            }
        );

        // Loguj szczegółowy błąd jeśli występuje
        if (response.status?.code >= 400) {
            console.error('   [KSeF] ❌ Błąd faktury:', response.status?.description);
            if (response.status?.details) {
                console.error('   [KSeF] Szczegóły:', JSON.stringify(response.status.details, null, 2));
            }
        }

        return response;
    }

    /**
     * Pobranie faktury po numerze KSeF
     * GET /invoices/ksef/{ksefNumber}
     */
    async getInvoiceByKsefNumber(
        ksefNumber: string,
    ): Promise<InvoiceDetailsResponse> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        return await this.requestJson<InvoiceDetailsResponse>(
            'GET',
            `/invoices/ksef/${ksefNumber}`,
            undefined,
            { Authorization: `Bearer ${this.accessToken}` },
        );
    }

    /**
     * Pobranie UPO dla faktury w ramach aktywnej sesji
     * GET /sessions/{referenceNumber}/invoices/{invoiceReferenceNumber}/upo
     */
    async downloadUpoFromSession(
        invoiceReferenceNumber: string,
    ): Promise<Buffer> {
        if (!this.sessionReferenceNumber || !this.accessToken) {
            throw new Error('Brak aktywnej sesji');
        }

        return await this.requestArrayBuffer(
            `/sessions/${this.sessionReferenceNumber}/invoices/${invoiceReferenceNumber}/upo`,
            { Authorization: `Bearer ${this.accessToken}` },
        );
    }

    /**
     * Zamknięcie sesji wysyłki
     * POST /sessions/online/{referenceNumber}/close
     */
    async closeSession(): Promise<void> {
        if (!this.sessionReferenceNumber || !this.accessToken) {
            console.log('   [Session] Brak aktywnej sesji do zamknięcia');
            return;
        }

        try {
            await this.requestJson<unknown>(
                'POST',
                `/sessions/online/${this.sessionReferenceNumber}/close`,
                {},
                { Authorization: `Bearer ${this.accessToken}` },
            );
            console.log('   [Session] ✅ Sesja zamknięta');
        } catch (err: any) {
            console.warn('   [Session] Błąd zamykania sesji:', err.message);
        }

        this.sessionReferenceNumber = null;
        this.aesKey = null;
        this.aesIv = null;
    }

    /**
     * Zakończenie całej sesji (uwierzytelnienia i wysyłki)
     */
    async terminateSession(): Promise<void> {
        await this.closeSession();

        // Możesz też unieważnić sesję uwierzytelnienia jeśli chcesz
        // DELETE /auth/sessions/current
        this.accessToken = null;
    }

    // ==================== STATUS I UPO ====================

    /**
     * Pobierz status faktury po numerze KSeF
     * GET /invoices/{ksefNumber}
     */
    async getStatus(ksefNumber: string): Promise<InvoiceStatusResponse> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        return await this.requestJson<InvoiceStatusResponse>(
            'GET',
            `/invoices/${ksefNumber}`,
            undefined,
            { Authorization: `Bearer ${this.accessToken}` },
        );
    }

    /**
     * Pobierz UPO (Urzędowe Poświadczenie Odbioru) dla faktury przez sesję
     * GET /sessions/{sessionRef}/invoices/ksef/{ksefNumber}/upo
     *
     * UWAGA: W KSeF API 2.0 nie ma bezpośredniego endpointu /invoices/{ksefNumber}/upo
     * UPO można pobrać tylko:
     * 1. Przez upoDownloadUrl z odpowiedzi statusu (preferowane)
     * 2. Przez endpoint sesyjny (wymaga sessionReferenceNumber)
     */
    async downloadUpoByKsefNumber(
        ksefNumber: string,
        sessionReferenceNumber: string,
    ): Promise<Buffer> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        // Pobieranie UPO przez sesję wymaga sessionReferenceNumber
        return await this.requestArrayBuffer(
            `/sessions/${sessionReferenceNumber}/invoices/ksef/${ksefNumber}/upo`,
            {
                Accept: 'application/xml',
                Authorization: `Bearer ${this.accessToken}`,
            },
        );
    }

    /**
     * Pobierz UPO przez bezpośredni URL (nie wymaga autoryzacji)
     * Preferowana metoda - używa linku z odpowiedzi statusu
     */
    async downloadUpoFromUrl(upoDownloadUrl: string): Promise<Buffer> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await this.fetchWithRetry(upoDownloadUrl, {
                method: 'GET',
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(
                    `KSeF UPO HTTP ${response.status} ${response.statusText}: ${text}`,
                );
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // ==================== POMOCNICZE ====================

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Sprawdź czy mamy aktywną sesję uwierzytelnienia
     */
    isAuthenticated(): boolean {
        return !!this.accessToken;
    }

    /**
     * Sprawdź czy mamy aktywną sesję wysyłki
     */
    hasActiveSession(): boolean {
        return !!this.sessionReferenceNumber;
    }

    /**
     * Pobierz numer referencyjny aktywnej sesji wysyłki
     */
    getSessionReferenceNumber(): string | null {
        return this.sessionReferenceNumber;
    }

    // ==================== FAKTURY ZAKUPOWE (COST INVOICES) ====================

    /**
     * Pobierz listę faktur zakupowych (gdzie nasza firma jest nabywcą - Subject2)
     * 
     * Używa asynchronicznego eksportu:
     * 1. POST /invoices/exports - inicjuje eksport (NIE wymaga sesji interaktywnej!)
     * 2. GET /invoices/exports/{referenceNumber} - polling statusu
     * 3. Pobiera zaszyfrowane paczki ZIP z fakturami
     * 4. Deszyfruje AES i rozpakowuje ZIP
     * 5. Parsuje XML-e faktur
     *
     * @param dateFrom Data początkowa
     * @param dateTo Data końcowa
     */
    async searchPurchaseInvoices(
        dateFrom: Date,
        dateTo: Date,
        pageOffset: number = 0,
    ): Promise<{ invoices: PurchaseInvoiceListItem[]; hasMorePages: boolean; totalCount: number }> {
        // Upewnij się że mamy accessToken (NIE sesję interaktywną!)
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        // 1. Inicjuj eksport faktur zakupowych
        const { referenceNumber } = await this.initiateInvoiceExport(dateFrom, dateTo, 'Subject2');

        // 2. Czekaj na zakończenie eksportu
        const exportStatus = await this.waitForExportCompletion(referenceNumber) as ExportStatusWithPackage;

        // 3. Sprawdź czy są faktury do pobrania
        const invoiceCount = exportStatus.package?.invoiceCount ?? 0;
        if (invoiceCount === 0 || !exportStatus.package?.parts?.length) {
            console.log(`   [KSeF] Brak faktur w eksporcie`);
            return { invoices: [], hasMorePages: false, totalCount: 0 };
        }

        console.log(`   [KSeF] Eksport zawiera ${invoiceCount} faktur w ${exportStatus.package.parts.length} paczkach`);

        // 4. Pobierz i odszyfruj wszystkie paczki
        const invoices: PurchaseInvoiceListItem[] = [];
        for (const part of exportStatus.package.parts) {
            const partInvoices = await this.downloadAndProcessPackagePart(part);
            invoices.push(...partInvoices);
        }

        console.log(`   [KSeF] Znaleziono ${invoices.length} faktur zakupowych`);

        return {
            invoices,
            hasMorePages: exportStatus.package.isTruncated ?? false,
            totalCount: invoices.length,
        };
    }

    /**
     * Pobierz zaszyfrowaną paczkę, odszyfruj i wypakuj faktury
     */
    private async downloadAndProcessPackagePart(part: ExportPackagePart): Promise<PurchaseInvoiceListItem[]> {
        console.log(`   [KSeF] Pobieranie paczki: ${part.partName} (${part.encryptedPartSize} B)`);

        // 1. Pobierz zaszyfrowany plik
        const encryptedData = await this.downloadFromUrl(part.url);
        console.log(`   [KSeF] Pobrano ${encryptedData.length} B`);

        // 2. Odszyfruj AES-256-CBC
        if (!this.aesKey || !this.aesIv) {
            throw new Error('Brak klucza AES do odszyfrowania paczki');
        }

        const decryptedData = this.decryptAes(encryptedData, this.aesKey, this.aesIv);
        console.log(`   [KSeF] Odszyfrowano ${decryptedData.length} B`);

        // 3. Rozpakuj ZIP
        const zip = new AdmZip(decryptedData);
        const zipEntries = zip.getEntries();
        console.log(`   [KSeF] ZIP zawiera ${zipEntries.length} plików`);

        // 4. Parsuj każdy plik XML
        const invoices: PurchaseInvoiceListItem[] = [];
        for (const entry of zipEntries) {
            if (entry.entryName.endsWith('.xml')) {
                const xmlContent = entry.getData().toString('utf-8');
                const invoice = this.parseInvoiceXmlToListItem(xmlContent, entry.entryName);
                if (invoice) {
                    invoices.push(invoice);
                }
            }
        }

        return invoices;
    }

    /**
     * Pobierz plik z zewnętrznego URL (np. Azure Blob Storage)
     */
    private async downloadFromUrl(url: string, timeoutMs = 120000): Promise<Buffer> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await this.fetchWithRetry(url, {
                method: 'GET',
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Download failed HTTP ${response.status}: ${text}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Odszyfruj dane AES-256-CBC
     */
    private decryptAes(encryptedData: Buffer, key: Buffer, iv: Buffer): Buffer {
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final(),
        ]);
        return decrypted;
    }

    /**
     * Parsuj XML faktury KSeF do PurchaseInvoiceListItem
     * Obsługuje format FA(2) zgodny z KSeF
     */
    private parseInvoiceXmlToListItem(xml: string, filename: string): PurchaseInvoiceListItem | null {
        try {
            // Prosty parser XML bez zewnętrznych bibliotek
            const getValue = (tagName: string): string => {
                const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
                const match = xml.match(regex);
                return match ? match[1].trim() : '';
            };

            const getNestedValue = (outerTag: string, innerTag: string): string => {
                const outerRegex = new RegExp(`<${outerTag}[^>]*>([\\s\\S]*?)</${outerTag}>`, 'i');
                const outerMatch = xml.match(outerRegex);
                if (!outerMatch) return '';
                const innerRegex = new RegExp(`<${innerTag}[^>]*>([^<]*)</${innerTag}>`, 'i');
                const innerMatch = outerMatch[1].match(innerRegex);
                return innerMatch ? innerMatch[1].trim() : '';
            };

            // Numer KSeF z nazwy pliku lub z XML
            let ksefNumber = filename.replace('.xml', '');
            const ksefRefMatch = xml.match(/<KsefReferenceNumber>([^<]+)<\/KsefReferenceNumber>/i);
            if (ksefRefMatch) {
                ksefNumber = ksefRefMatch[1].trim();
            }

            // Dane sprzedawcy (Subject1 = dostawca w fakturze zakupowej)
            const sellerNip = getNestedValue('Podmiot1', 'NIP') || getNestedValue('Sprzedawca', 'NIP') || getValue('NIP');
            const sellerName = getNestedValue('Podmiot1', 'Nazwa') || 
                               getNestedValue('Podmiot1', 'NazwaHandlowa') ||
                               getNestedValue('Sprzedawca', 'Nazwa') || 
                               getValue('Nazwa');

            // Numer faktury
            const invoiceNumber = getValue('P_2') || getValue('NrFaktury') || getValue('NumerFaktury') || '';

            // Data wystawienia
            const invoicingDate = getValue('P_1') || getValue('DataWystawienia') || '';

            // Data przyjęcia do KSeF
            const acquisitionTimestamp = getValue('DataPrzyjecia') || getValue('AcquisitionTimestamp') || '';

            // Typ faktury
            const invoiceType = getValue('RodzajFaktury') || 'FA';

            // Kwota brutto
            const grossValueStr = getValue('P_15') || getValue('BruttoPozSumPlatnosc') || getValue('Brutto') || '0';
            const grossValue = parseFloat(grossValueStr.replace(',', '.')) || 0;

            // Waluta
            const currency = getValue('KodWaluty') || 'PLN';

            console.log(`   [KSeF] Sparsowano fakturę: ${invoiceNumber} od ${sellerName} (${sellerNip}), kwota: ${grossValue} ${currency}`);

            return {
                ksefNumber,
                ksefReferenceNumber: ksefNumber,
                subjectNip: sellerNip,
                subjectName: sellerName,
                invoiceNumber,
                invoicingDate,
                acquisitionTimestamp,
                invoiceType,
                grossValue,
                currency,
                rawXml: xml,
            };
        } catch (error) {
            console.error(`   [KSeF] Błąd parsowania XML ${filename}:`, error);
            return null;
        }
    }

    /**
     * Inicjuj asynchroniczny eksport faktur
     * POST /invoices/exports
     * 
     * UWAGA: NIE wymaga sesji interaktywnej, tylko accessToken!
     */
    private async initiateInvoiceExport(
        dateFrom: Date,
        dateTo: Date,
        subjectType: 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized',
    ): Promise<{ referenceNumber: string }> {
        // Generuj klucz AES do szyfrowania paczki (jeśli nie mamy)
        if (!this.aesKey || !this.aesIv) {
            this.aesKey = crypto.randomBytes(32); // 256 bits
            this.aesIv = crypto.randomBytes(16); // 128 bits
        }

        // Pobierz certyfikaty jeśli nie mamy
        if (!this.symmetricKeyEncryptionCert) {
            await this.fetchPublicKeys();
        }

        // Zaszyfruj klucz AES
        const encryptedAesKey = this.encryptAesKeyRaw(this.aesKey);

        // Struktura zgodna z KSeF API 2.0
        const requestBody = {
            filters: {
                subjectType,
                dateRange: {
                    from: this.formatDateTimeISO(dateFrom),
                    to: this.formatDateTimeISO(dateTo, true),
                    dateType: 'Invoicing', // Invoicing | Issue | PermanentStorage
                },
            },
            encryption: {
                encryptedSymmetricKey: encryptedAesKey,
                initializationVector: this.aesIv.toString('base64'),
            },
        };

        console.log(`   [KSeF] Inicjowanie eksportu faktur ${subjectType}: ${dateFrom.toISOString().split('T')[0]} - ${dateTo.toISOString().split('T')[0]}`);

        const response = await this.requestJson<{ referenceNumber: string }>(
            'POST',
            '/invoices/exports',
            requestBody,
            { 
                Authorization: `Bearer ${this.accessToken}`,
                'X-KSeF-Feature': 'include-metadata', // Dołącz metadane do paczki
            },
        );

        console.log(`   [KSeF] Export reference: ${response.referenceNumber}`);
        return response;
    }

    /**
     * Czekaj na zakończenie eksportu
     * GET /invoices/exports/{referenceNumber}
     */
    private async waitForExportCompletion(referenceNumber: string, maxWaitMs = 300000): Promise<InvoiceExportStatusResponse> {
        const startTime = Date.now();
        let attemptCount = 0;

        while (Date.now() - startTime < maxWaitMs) {
            const response = await this.requestJson<any>(
                'GET',
                `/invoices/exports/${referenceNumber}`,
                undefined,
                { Authorization: `Bearer ${this.accessToken}` },
            );

            attemptCount++;
            
            // Loguj pełną odpowiedź przy pierwszym wywołaniu dla debugowania
            if (attemptCount === 1) {
                console.log(`   [KSeF] Export status response:`, JSON.stringify(response, null, 2));
            }

            // Sprawdź różne możliwe nazwy pól statusu
            const code = response.processingCode ?? response.status?.code ?? response.statusCode;
            const description = response.processingDescription ?? response.status?.description ?? response.statusDescription ?? '';
            const numberOfElements = response.numberOfElements ?? response.invoicesCount ?? 0;
            
            console.log(`   [KSeF] Export status: ${code} - ${description}`);

            // 200 = zakończone sukcesem
            if (code === 200 || code === 'COMPLETED' || response.status === 'COMPLETED') {
                console.log(`   [KSeF] Export completed: ${numberOfElements} faktur`);
                return response;
            }

            // Błąd
            if ((typeof code === 'number' && code >= 400) || code === 'FAILED' || response.status === 'FAILED') {
                throw new Error(`Export failed (${code}): ${description}`);
            }

            // Czekaj przed kolejnym sprawdzeniem
            await this.sleep(3000);
        }

        throw new Error('Export timeout - maksymalny czas oczekiwania przekroczony');
    }

    /**
     * Parsuj metadane faktur z odpowiedzi statusu eksportu
     */
    private parseExportMetadata(status: InvoiceExportStatusResponse): PurchaseInvoiceListItem[] {
        if (!status.invoiceList || !Array.isArray(status.invoiceList)) {
            return [];
        }

        return status.invoiceList.map((inv: any) => ({
            ksefNumber: inv.ksefReferenceNumber || inv.ksefNumber || '',
            ksefReferenceNumber: inv.ksefReferenceNumber || inv.ksefNumber || '',
            subjectNip: inv.subjectNip || inv.sellerNip || '',
            subjectName: inv.subjectName || inv.sellerName || '',
            invoiceNumber: inv.invoiceNumber || inv.invoiceReferenceNumber || '',
            invoicingDate: inv.invoicingDate || '',
            acquisitionTimestamp: inv.acquisitionTimestamp || inv.permanentStorageDate || '',
            invoiceType: inv.invoiceType || 'FA',
            grossValue: inv.grossValue ? parseFloat(String(inv.grossValue)) : undefined,
            currency: inv.currency || 'PLN',
        }));
    }

    /**
     * Formatuje datę do ISO 8601
     */
    private formatDateTimeISO(date: Date, endOfDay: boolean = false): string {
        const d = new Date(date);
        if (endOfDay) {
            d.setHours(23, 59, 59, 999);
        } else {
            d.setHours(0, 0, 0, 0);
        }
        return d.toISOString();
    }

    /**
     * Pobierz wszystkie faktury zakupowe z danego okresu
     * NIE wymaga sesji interaktywnej!
     *
     * @param dateFrom Data początkowa
     * @param dateTo Data końcowa
     */
    async fetchAllPurchaseInvoices(
        dateFrom: Date,
        dateTo: Date,
    ): Promise<PurchaseInvoiceListItem[]> {
        // searchPurchaseInvoices zwraca wszystkie faktury za jednym razem (z eksportu)
        const result = await this.searchPurchaseInvoices(dateFrom, dateTo);
        console.log(`   [KSeF] Pobrano łącznie ${result.invoices.length} faktur zakupowych`);
        return result.invoices;
    }

    /**
     * Pobierz szczegóły faktury (XML) po numerze KSeF
     * GET /invoices/ksef/{ksefNumber}
     *
     * UWAGA: NIE wymaga sesji interaktywnej, tylko accessToken!
     */
    async getInvoiceXml(ksefNumber: string): Promise<string> {
        // Upewnij się że mamy accessToken
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        console.log(`   [KSeF] Pobieranie XML faktury: ${ksefNumber}`);

        const buffer = await this.requestArrayBuffer(
            `/invoices/ksef/${ksefNumber}`,
            {
                Accept: 'application/octet-stream',
                Authorization: `Bearer ${this.accessToken}`,
            },
        );

        return buffer.toString('utf-8');
    }
}

// ==================== INTERFEJSY DLA FAKTUR ZAKUPOWYCH ====================

/** Response z GET /invoices/exports/{referenceNumber} */
interface InvoiceExportStatusResponse {
    referenceNumber?: string;
    processingCode?: number;
    processingDescription?: string;
    numberOfElements?: number;
    numberOfParts?: number;
    permanentStorageHwmDate?: string;
    lastPermanentStorageDate?: string;
    isTruncated?: boolean;
    invoiceList?: InvoiceExportMetadata[];
    packageParts?: {
        parts?: {
            partNumber: number;
            url: string;
            size: number;
        }[];
    };
}

/** Metadane pojedynczej faktury w eksporcie */
interface InvoiceExportMetadata {
    ksefReferenceNumber?: string;
    ksefNumber?: string;
    invoiceNumber?: string;
    invoiceReferenceNumber?: string;
    invoicingDate?: string;
    permanentStorageDate?: string;
    acquisitionTimestamp?: string;
    subjectNip?: string;
    sellerNip?: string;
    subjectName?: string;
    sellerName?: string;
    invoiceType?: string;
    netValue?: string;
    vatValue?: string;
    grossValue?: string;
    currency?: string;
}

/** Element listy faktur zakupowych */
export interface PurchaseInvoiceListItem {
    ksefNumber: string;
    ksefReferenceNumber: string;
    subjectNip: string;
    subjectName: string;
    invoiceNumber: string;
    invoicingDate: string;
    acquisitionTimestamp: string;
    invoiceType: string;
    grossValue?: number;
    currency?: string;
    /** Surowy XML faktury - do parsowania szczegółów */
    rawXml?: string;
}

/** Część paczki eksportu */
interface ExportPackagePart {
    ordinalNumber: number;
    partName: string;
    method: string;
    url: string;
    partSize: number;
    partHash: string;
    encryptedPartSize: number;
    encryptedPartHash: string;
    expirationDate: string;
}

/** Odpowiedź statusu eksportu z paczką */
interface ExportStatusWithPackage {
    status: { code: number; description: string };
    completedDate?: string;
    packageExpirationDate?: string;
    package?: {
        invoiceCount: number;
        size: number;
        parts: ExportPackagePart[];
        isTruncated: boolean;
    };
}
