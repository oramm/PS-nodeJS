import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

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
    private client: AxiosInstance;
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
        this.baseURL = process.env.KSEF_API_URL_TEST || process.env.KSEF_API_URL_PROD || '';
        this.client = axios.create({ 
            baseURL: this.baseURL, 
            timeout: 60000 
        });
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
    async getAuthChallenge(): Promise<{ challenge: string; timestampMs: number }> {
        console.log('   [Auth] Pobieranie challenge...');
        
        const response = await this.client.post('/auth/challenge', {}, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const { challenge, timestampMs } = response.data;
        console.log('   [Auth] Otrzymano challenge:', challenge.substring(0, 20) + '...');
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
        const ksefToken = process.env.KSEF_AUTH_TOKEN_TEST || process.env.KSEF_AUTH_TOKEN_PROD;
        const nip = process.env.KSEF_NIP;

        if (!ksefToken || !nip) {
            throw new Error('Brak KSEF_AUTH_TOKEN_TEST lub KSEF_NIP w .env');
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
        console.log('   [Auth] Token do szyfrowania (długość):', tokenWithTimestamp.length, 'znaków');
        
        const encryptedToken = this.encryptKsefToken(tokenWithTimestamp);

        // 4. Wyślij żądanie uwierzytelnienia
        const requestBody = {
            challenge: challenge,
            contextIdentifier: {
                type: 'Nip',
                value: nip
            },
            encryptedToken: encryptedToken
        };

        const response = await this.client.post('/auth/ksef-token', requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // 5. Pobierz authenticationToken (potrzebny do pollingu)
        const authReferenceNumber = response.data.referenceNumber;
        const authenticationToken = response.data.authenticationToken?.token;
        
        if (!authenticationToken) {
            throw new Error('Nie otrzymano authenticationToken z odpowiedzi /auth/ksef-token');
        }
        
        console.log('   [Auth] Operacja uwierzytelnienia:', authReferenceNumber);
        
        // 6. Poczekaj na zakończenie uwierzytelnienia (polling)
        await this.pollAuthStatus(authReferenceNumber, authenticationToken);
        
        // 7. Pobierz tokeny dostępu (accessToken + refreshToken)
        this.accessToken = await this.redeemTokens(authenticationToken);
        
        console.log('   [Auth] ✅ Uwierzytelnienie zakończone, otrzymano accessToken');
        return this.accessToken;
    }

    /**
     * Polling statusu uwierzytelnienia
     * GET /auth/{referenceNumber}
     * Wymaga AuthenticationToken jako Bearer
     */
    private async pollAuthStatus(referenceNumber: string, authenticationToken: string, maxAttempts = 30): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            const response = await this.client.get(`/auth/${referenceNumber}`, {
                headers: { 
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authenticationToken}`
                }
            });

            const statusCode = response.data.status?.code;
            const statusDesc = response.data.status?.description || '';
            console.log(`   [Auth] Status: ${statusCode} - ${statusDesc} (próba ${i + 1}/${maxAttempts})`);

            if (statusCode === 200) {
                // Uwierzytelnienie zakończone sukcesem
                return;
            }
            
            if (statusCode >= 400) {
                const details = response.data.status?.details?.join(', ') || statusDesc;
                throw new Error(`Błąd uwierzytelnienia (${statusCode}): ${details}`);
            }

            // Status 100 = w toku - czekamy
            await this.sleep(1000);
        }

        throw new Error('Timeout uwierzytelnienia - przekroczono maksymalną liczbę prób');
    }

    /**
     * Pobranie tokenów dostępu po pomyślnym uwierzytelnieniu
     * POST /auth/token/redeem
     * Wymaga AuthenticationToken jako Bearer
     * Zwraca accessToken i refreshToken
     */
    private async redeemTokens(authenticationToken: string): Promise<string> {
        console.log('   [Auth] Pobieranie tokenów dostępu...');
        
        const response = await this.client.post('/auth/token/redeem', {}, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${authenticationToken}`
            }
        });

        const accessToken = response.data.accessToken?.token;
        const refreshToken = response.data.refreshToken?.token;
        
        if (!accessToken) {
            throw new Error('Nie otrzymano accessToken z /auth/token/redeem');
        }

        // Zapisz refresh token na przyszłość (opcjonalne)
        this.refreshToken = refreshToken;
        
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

    private async fetchPublicKeys(): Promise<void> {
        console.log('   [Auth] Pobieranie certyfikatów KSeF...');
        
        const response = await this.client.get('/security/public-key-certificates', {
            headers: { 'Accept': 'application/json' }
        });

        const certificates = response.data;
        
        if (!Array.isArray(certificates) || certificates.length === 0) {
            throw new Error('Nie otrzymano listy certyfikatów z KSeF');
        }

        // Znajdź certyfikat do szyfrowania tokenów
        const tokenCert = certificates.find((c: any) => 
            c.usage && c.usage.includes('KsefTokenEncryption')
        );
        if (!tokenCert) {
            throw new Error('Nie znaleziono certyfikatu KsefTokenEncryption');
        }
        this.ksefTokenEncryptionCert = tokenCert.certificate;

        // Znajdź certyfikat do szyfrowania klucza AES
        const aesCert = certificates.find((c: any) => 
            c.usage && c.usage.includes('SymmetricKeyEncryption')
        );
        if (!aesCert) {
            throw new Error('Nie znaleziono certyfikatu SymmetricKeyEncryption');
        }
        this.symmetricKeyEncryptionCert = aesCert.certificate;

        console.log('   [Auth] ✅ Pobrano certyfikaty KSeF');
    }

    /**
     * Szyfrowanie RSA-OAEP SHA-256 przy użyciu certyfikatu X.509
     */
    private encryptWithCertificate(plaintext: string, certBase64: string): string {
        // Certyfikat jest w Base64 DER, konwertuj do prawidłowego formatu PEM
        // PEM wymaga podziału na linie po 64 znaki
        const certLines = certBase64.match(/.{1,64}/g) || [];
        const pemCert = `-----BEGIN CERTIFICATE-----\n${certLines.join('\n')}\n-----END CERTIFICATE-----`;

        // Wyciągnij klucz publiczny z certyfikatu X.509
        const publicKey = crypto.createPublicKey({
            key: pemCert,
            format: 'pem'
        });

        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            Buffer.from(plaintext, 'utf-8')
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
        return this.encryptWithCertificate(tokenWithTimestamp, this.ksefTokenEncryptionCert);
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
        const certLines = this.symmetricKeyEncryptionCert.match(/.{1,64}/g) || [];
        const pemCert = `-----BEGIN CERTIFICATE-----\n${certLines.join('\n')}\n-----END CERTIFICATE-----`;

        // Wyciągnij klucz publiczny z certyfikatu X.509
        const publicKey = crypto.createPublicKey({
            key: pemCert,
            format: 'pem'
        });

        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            aesKey  // Surowe bajty, nie Base64!
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
        return this.encryptWithCertificate(aesKeyBase64, this.symmetricKeyEncryptionCert);
    }

    // ==================== SESJA WYSYŁKI (KSeF 2.0) ====================
    
    // Konfiguracja schematu FA(3) - obowiązuje od 01.09.2025
    private static readonly FORM_CODE = {
        systemCode: 'FA (3)',
        schemaVersion: '1-0E',
        value: 'FA'
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

        console.log(`   [Session] Otwieranie sesji interaktywnej (schemat: ${KsefService.FORM_CODE.systemCode})...`);

        // Generuj klucz AES-256 i IV dla tej sesji
        this.aesKey = crypto.randomBytes(32); // 256 bits
        this.aesIv = crypto.randomBytes(16);  // 128 bits

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
                initializationVector: this.aesIv.toString('base64')
            }
        };

        const response = await this.client.post('/sessions/online', requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        this.sessionReferenceNumber = response.data.referenceNumber;
        console.log('   [Session] ✅ Sesja otwarta:', this.sessionReferenceNumber);
        
        return this.sessionReferenceNumber!;
    }

    /**
     * Wysyłka faktury w ramach sesji interaktywnej
     * POST /sessions/online/{referenceNumber}/invoices
     * 
     * Faktura musi być zaszyfrowana AES-256-CBC
     * Request body zawiera metadane i zaszyfrowaną treść
     */
    async submitInvoice(xml: string): Promise<any> {
        if (!this.sessionReferenceNumber) {
            await this.openSession();
        }

        console.log('   [Send] Szyfrowanie i wysyłka faktury...');

        // Konwertuj XML do bajtów
        const invoiceBytes = Buffer.from(xml, 'utf-8');
        
        // Zaszyfruj XML faktury algorytmem AES-256-CBC
        const encryptedInvoice = this.encryptWithAES(xml);

        // Oblicz hash SHA-256 oryginalnej faktury
        const invoiceHash = crypto.createHash('sha256').update(invoiceBytes).digest('base64');
        const invoiceSize = invoiceBytes.length;

        // Oblicz hash SHA-256 zaszyfrowanej faktury
        const encryptedInvoiceHash = crypto.createHash('sha256').update(encryptedInvoice).digest('base64');
        const encryptedInvoiceSize = encryptedInvoice.length;

        // Przygotuj request body zgodnie z SendInvoiceRequest
        const requestBody = {
            invoiceHash: invoiceHash,
            invoiceSize: invoiceSize,
            encryptedInvoiceHash: encryptedInvoiceHash,
            encryptedInvoiceSize: encryptedInvoiceSize,
            encryptedInvoiceContent: encryptedInvoice.toString('base64'),
            offlineMode: false
        };

        console.log('   [Send] Invoice size:', invoiceSize, 'Encrypted size:', encryptedInvoiceSize);

        const response = await this.client.post(
            `/sessions/online/${this.sessionReferenceNumber}/invoices`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        console.log('   [Send] ✅ Faktura wysłana, referenceNumber:', response.data.invoiceReferenceNumber || response.data.referenceNumber);
        return response.data;
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

        const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, this.aesIv);
        cipher.setAutoPadding(true); // PKCS#7 padding

        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf-8'),
            cipher.final()
        ]);

        // W API 2.0 NIE dodajemy IV jako prefix - IV jest przekazany przy otwieraniu sesji
        return encrypted;
    }

    /**
     * Sprawdzenie statusu sesji
     * GET /sessions/{referenceNumber}
     */
    async getSessionStatus(): Promise<any> {
        if (!this.sessionReferenceNumber || !this.accessToken) {
            throw new Error('Brak aktywnej sesji');
        }

        const response = await this.client.get(
            `/sessions/${this.sessionReferenceNumber}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        return response.data;
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
    async getInvoiceStatus(invoiceReferenceNumber: string, sessionReferenceNumber?: string): Promise<any> {
        // Upewnij się że mamy token autoryzacji
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        // Użyj przekazanej sesji lub bieżącej
        const sessionRef = sessionReferenceNumber || this.sessionReferenceNumber;
        if (!sessionRef) {
            throw new Error('Brak numeru referencyjnego sesji - podaj sessionReferenceNumber');
        }

        const response = await this.client.get(
            `/sessions/${sessionRef}/invoices/${invoiceReferenceNumber}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        return response.data;
    }

    /**
     * Pobranie faktury po numerze KSeF
     * GET /invoices/ksef/{ksefNumber}
     */
    async getInvoiceByKsefNumber(ksefNumber: string): Promise<any> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        const response = await this.client.get(
            `/invoices/ksef/${ksefNumber}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        return response.data;
    }

    /**
     * Pobranie UPO dla faktury w ramach aktywnej sesji
     * GET /sessions/{referenceNumber}/invoices/{invoiceReferenceNumber}/upo
     */
    async downloadUpoFromSession(invoiceReferenceNumber: string): Promise<Buffer> {
        if (!this.sessionReferenceNumber || !this.accessToken) {
            throw new Error('Brak aktywnej sesji');
        }

        const response = await this.client.get(
            `/sessions/${this.sessionReferenceNumber}/invoices/${invoiceReferenceNumber}/upo`,
            {
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        return Buffer.from(response.data);
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
            await this.client.post(
                `/sessions/online/${this.sessionReferenceNumber}/close`,
                {},
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
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
    async getStatus(ksefNumber: string): Promise<any> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        const response = await this.client.get(`/invoices/${ksefNumber}`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        return response.data;
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
    async downloadUpoByKsefNumber(ksefNumber: string, sessionReferenceNumber: string): Promise<Buffer> {
        if (!this.accessToken) {
            await this.authenticateWithKsefToken();
        }

        // Pobieranie UPO przez sesję wymaga sessionReferenceNumber
        const response = await this.client.get(
            `/sessions/${sessionReferenceNumber}/invoices/ksef/${ksefNumber}/upo`,
            {
                headers: {
                    'Accept': 'application/xml', // UPO zwracane jako XML
                    'Authorization': `Bearer ${this.accessToken}`
                },
                responseType: 'arraybuffer'
            }
        );

        return Buffer.from(response.data);
    }
    
    /**
     * Pobierz UPO przez bezpośredni URL (nie wymaga autoryzacji)
     * Preferowana metoda - używa linku z odpowiedzi statusu
     */
    async downloadUpoFromUrl(upoDownloadUrl: string): Promise<Buffer> {
        const axios = require('axios');
        const response = await axios.get(upoDownloadUrl, {
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    }

    // ==================== POMOCNICZE ====================

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
}
