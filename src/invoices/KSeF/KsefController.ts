import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemsController from '../InvoiceItemsController';
import KsefService from './KsefService';
import KsefXmlBuilder, { OriginalInvoiceData } from './KsefXmlBuilder';
import InvoiceKsefValidator from './InvoiceKsefValidator';
import KsefMetadataRepository from './KsefMetadataRepository';
import Setup from '../../setup/Setup';
import * as crypto from 'crypto';

/**
 * KSeF Controller
 * 
 * Zarządza integracją faktur z KSeF API 2.0
 * 
 * Flow wysyłki faktury:
 * 1. submitInvoiceById() - wysyła fakturę, otrzymuje referenceNumber
 * 2. KSeF przetwarza fakturę asynchronicznie (może trwać kilka sekund)
 * 3. checkStatusByInvoiceId() - sprawdza status, otrzymuje ksefNumber gdy gotowe
 * 4. downloadUpoByInvoiceId() - pobiera UPO (Urzędowe Poświadczenie Odbioru)
 */
export default class KsefController {
    // Nie używamy static service - tworzymy nową instancję dla każdej operacji
    // ponieważ tokeny KSeF wygasają po ~15 minutach
    private static repo = new InvoiceRepository();

    private static getQrBaseUrl(): string {
        return Setup.KSeF.environment === 'production'
            ? 'https://qr.ksef.mf.gov.pl'
            : 'https://qr-test.ksef.mf.gov.pl';
    }

    private static toBase64Url(buffer: Buffer): string {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    private static formatQrDate(dateValue: string): string {
        return new Date(dateValue)
            .toISOString()
            .slice(0, 10)
            .split('-')
            .reverse()
            .join('-');
    }

    private static extractStoredQrSeed(meta: any): {
        qrInvoiceHash: string;
        qrIssueDate: string;
    } | null {
        const rawResponse = meta?.ResponseRaw;
        if (!rawResponse) {
            return null;
        }

        try {
            const parsedResponse =
                typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;
            const qrInvoiceHash = parsedResponse?.qrInvoiceHash;
            const qrIssueDate = parsedResponse?.qrIssueDate;

            if (!qrInvoiceHash || !qrIssueDate) {
                return null;
            }

            return { qrInvoiceHash, qrIssueDate };
        } catch {
            return null;
        }
    }

    private static async loadInvoiceWithItems(invoiceId: number) {
        const invoices = await this.repo.find([{ id: invoiceId }]);
        const invoice = invoices[0];

        if (!invoice) {
            return null;
        }

        if (!invoice._items || invoice._items.length === 0) {
            invoice._items = await InvoiceItemsController.find([{ invoiceId }]);
        }

        return invoice;
    }

    private static buildOnlineQrData(
        invoice: any,
        qrSeed?: {
            qrInvoiceHash: string;
            qrIssueDate: string;
        },
    ): {
        qrVerificationUrl: string;
        qrLabel: string;
        qrPayload: {
            environment: string;
            sellerNip: string;
            issueDate: string;
            invoiceHash: string;
        };
    } | null {
        const sellerNip = (Setup.KSeF.nip || '').replace(/\D+/g, '');
        const issueDateSource = qrSeed?.qrIssueDate || invoice.sentDate || invoice.issueDate;

        if (!sellerNip || !invoice.ksefNumber || !issueDateSource) {
            return null;
        }

        const invoiceHash = qrSeed?.qrInvoiceHash;
        if (!invoiceHash || !qrSeed?.qrIssueDate) {
            return null;
        }

        return {
            qrVerificationUrl: `${this.getQrBaseUrl()}/invoice/${sellerNip}/${this.formatQrDate(issueDateSource)}/${invoiceHash}`,
            qrLabel: invoice.ksefNumber,
            qrPayload: {
                environment: Setup.KSeF.environment,
                sellerNip,
                issueDate: this.formatQrDate(issueDateSource),
                invoiceHash,
            },
        };
    }

    /**
     * Wysyła fakturę korygującą do KSeF
     * 
     * Faktura korygująca referencjonuje oryginalną fakturę i zawiera zmianę wartości.
     * 
     * Wymagane dane oryginalnej faktury (jeśli nie podane, zostaną pobrane z bazy):
     * - originalKsefNumber: numer KSeF oryginalnej faktury
     * - originalInvoiceNumber: numer wewnętrzny oryginalnej faktury (opcjonalny, pobierany z bazy)
     * - originalIssueDate: data wystawienia oryginalnej faktury (opcjonalny, pobierany z bazy)
     * 
     * @param invoiceId - ID faktury korygującej w systemie
     * @param originalKsefNumber - Numer KSeF faktury oryginalnej
     * @param originalData - Opcjonalne dodatkowe dane oryginalnej faktury
     * @returns { invoiceId, referenceNumber, status }
     */
    static async submitCorrectionById(
        invoiceId: number, 
        originalKsefNumber: string,
        originalData?: {
            originalInvoiceNumber?: string;
            originalIssueDate?: string;
            correctionReason?: string;
            correctionType?: 1 | 2 | 3;
        }
    ) {
        const service = new KsefService();
        
        // 1. Pobierz fakturę korygującą z pozycjami
        const invoices = await this.repo.find([{ id: invoiceId }]);
        const invoice = invoices[0];
        if (!invoice) throw new Error(`Faktura ${invoiceId} nie znaleziona`);

        // 2. Pobierz pozycje faktury jeśli nie załadowane
        if (!invoice._items || invoice._items.length === 0) {
            invoice._items = await InvoiceItemsController.find([{ invoiceId }]);
        }

        // 3. Waliduj dane wymagane przez KSeF
        InvoiceKsefValidator.validateForKsef(invoice as any);

        // 4. Przygotuj dane oryginalnej faktury
        let originalInvoiceData: OriginalInvoiceData;
        
        if (originalData?.originalInvoiceNumber && originalData?.originalIssueDate) {
            // Użyj danych przekazanych w parametrach
            originalInvoiceData = {
                ksefNumber: originalKsefNumber,
                invoiceNumber: originalData.originalInvoiceNumber,
                issueDate: originalData.originalIssueDate
            };
        } else {
            // Pobierz dane oryginalnej faktury z bazy na podstawie ksefNumber
            const originalInvoices = await this.repo.find([{ ksefNumber: originalKsefNumber }]);
            const originalInvoice = originalInvoices[0];
            
            if (originalInvoice) {
                originalInvoiceData = {
                    ksefNumber: originalKsefNumber,
                    invoiceNumber: originalInvoice.number || `FV/${originalInvoice.id}`,
                    issueDate: originalInvoice.issueDate 
                        ? new Date(originalInvoice.issueDate).toISOString().split('T')[0]
                        : new Date().toISOString().split('T')[0]
                };
            } else {
                // Fallback - użyj danych z parametrów lub domyślne
                originalInvoiceData = {
                    ksefNumber: originalKsefNumber,
                    invoiceNumber: originalData?.originalInvoiceNumber || 'BRAK',
                    issueDate: originalData?.originalIssueDate || new Date().toISOString().split('T')[0]
                };
                console.warn(`   [KSeF] Nie znaleziono oryginalnej faktury w bazie (ksefNumber: ${originalKsefNumber}). Używam przekazanych/domyślnych danych.`);
            }
        }

        // 5. Generuj XML korekty zgodnie ze schematem FA(3)
        const correctionReason = originalData?.correctionReason || 'Korekta faktury';
        const invoiceCorrectionType = Number((invoice as any).ksefCorrectionType);
        const correctionType =
            originalData?.correctionType ??
            ([1, 2, 3].includes(invoiceCorrectionType)
                ? (invoiceCorrectionType as 1 | 2 | 3)
                : undefined);
        
        const xml = KsefXmlBuilder.buildCorrectionXml(
            invoice, 
            originalInvoiceData,
            correctionReason,
            correctionType
        );
        console.log(`   [KSeF] Wygenerowano XML korekty FA(3) dla faktury ${invoice.number || invoiceId} (koryguje: ${originalKsefNumber})`);

        // 5. Wyślij korekty do KSeF (otwiera sesję, szyfruje i wysyła)
        const resp = await service.submitInvoice(xml, true); // true = korekta
        const qrIssueDate = invoice.sentDate || invoice.issueDate;
        const qrInvoiceHash = this.toBase64Url(
            crypto.createHash('sha256').update(Buffer.from(xml, 'utf-8')).digest(),
        );

        // 6. Zapisz metadata - referenceNumber
        const meta = {
            invoiceId,
            referenceNumber: resp.referenceNumber,
            sessionReferenceNumber: service.getSessionReferenceNumber(),
            status: 'PENDING',
            submittedAt: new Date(),
            isCorrectionInvoice: true,
            referencesOriginalKsefNumber: originalKsefNumber,
            responseRaw: {
                ...resp,
                qrInvoiceHash,
                qrIssueDate,
            },
        };
        await KsefMetadataRepository.saveMetadata(invoiceId, meta);

        // 7. Zaktualizuj status faktury
        try {
            invoice.ksefStatus = 'PENDING_CORRECTION';
            invoice.ksefSessionId = resp.referenceNumber;
            await this.repo.editInDb(invoice, undefined, undefined, ['ksefStatus', 'ksefSessionId']);
            console.log(`   [KSeF] Korekta faktury ${invoiceId} wysłana, referenceNumber: ${resp.referenceNumber}`);
        } catch (err) {
            console.error('Nie udało się zaktualizować statusu faktury:', err);
        }

        return { 
            invoiceId, 
            referenceNumber: resp.referenceNumber,
            status: 'PENDING',
            originalKsefNumber,
            message: 'Korekta wysłana do KSeF. Użyj checkStatus aby sprawdzić jej status.'
        };
    }

    /**
     * Wysyła fakturę do KSeF
     * 
     * @param invoiceId - ID faktury w systemie
     * @returns { invoiceId, referenceNumber, status } - numer referencyjny do sprawdzenia statusu
     */
    static async submitInvoiceById(invoiceId: number) {
        // Nowa instancja serwisu dla każdej wysyłki (fresh token)
        const service = new KsefService();
        // 1. Pobierz fakturę z pozycjami
        const invoices = await this.repo.find([{ id: invoiceId }]);
        const invoice = invoices[0];
        if (!invoice) throw new Error(`Faktura ${invoiceId} nie znaleziona`);

        // 2. Pobierz pozycje faktury jeśli nie załadowane
        if (!invoice._items || invoice._items.length === 0) {
            invoice._items = await InvoiceItemsController.find([{ invoiceId }]);
        }

        // 3. Waliduj dane wymagane przez KSeF
        InvoiceKsefValidator.validateForKsef(invoice as any);

        // 4. Generuj XML FA(3)
        const xml = KsefXmlBuilder.buildXml(invoice);
        console.log(`   [KSeF] Wygenerowano XML dla faktury ${invoice.number || invoiceId}`);

        // 5. Wyślij do KSeF (otwiera sesję, szyfruje i wysyła)
        const resp = await service.submitInvoice(xml);
        const qrIssueDate = invoice.sentDate || invoice.issueDate;
        const qrInvoiceHash = this.toBase64Url(
            crypto.createHash('sha256').update(Buffer.from(xml, 'utf-8')).digest(),
        );

        // 6. Zapisz metadata - referenceNumber (jeszcze nie mamy ksefNumber!)
        const meta = {
            invoiceId,
            referenceNumber: resp.referenceNumber,
            sessionReferenceNumber: service.getSessionReferenceNumber(),
            status: 'PENDING', // Oczekuje na przetworzenie
            submittedAt: new Date(),
            responseRaw: {
                ...resp,
                qrInvoiceHash,
                qrIssueDate,
            },
        };
        await KsefMetadataRepository.saveMetadata(invoiceId, meta);

        // 7. Zaktualizuj status faktury w systemie
        try {
            invoice.ksefStatus = 'PENDING';
            invoice.ksefSessionId = resp.referenceNumber; // Tymczasowo - to jest referenceNumber
            await this.repo.editInDb(invoice, undefined, undefined, ['ksefStatus', 'ksefSessionId']);
            console.log(`   [KSeF] Faktura ${invoiceId} wysłana, referenceNumber: ${resp.referenceNumber}`);
        } catch (err) {
            console.error('Nie udało się zaktualizować statusu faktury:', err);
        }

        return { 
            invoiceId, 
            referenceNumber: resp.referenceNumber,
            status: 'PENDING',
            message: 'Faktura wysłana do KSeF. Użyj checkStatus aby sprawdzić czy otrzymała numer KSeF.'
        };
    }

    /**
     * Sprawdza status faktury w KSeF
     * Jeśli faktura przetworzona - zwraca ksefNumber i aktualizuje rekord
     * 
     * @param invoiceId - ID faktury w systemie
     * @returns Status faktury z KSeF
     */
    static async checkStatusByInvoiceId(invoiceId: number) {
        // 1. Pobierz metadata faktury
        const meta = await KsefMetadataRepository.findByInvoiceId(invoiceId);
        if (!meta) {
            throw new Error(`Faktura ${invoiceId} nie była wysłana do KSeF`);
        }

        // 2. Jeśli już mamy ksefNumber - zwróć zapisane dane
        if (meta.KsefNumber) {
            const invoice = await this.loadInvoiceWithItems(invoiceId);
            const qrSeed = this.extractStoredQrSeed(meta);
            return {
                invoiceId,
                ksefNumber: meta.KsefNumber,
                status: meta.Status,
                acquisitionDate: meta.AcquisitionDate,
                upoDownloadUrl: meta.UpoDownloadUrl,
                ...(invoice ? this.buildOnlineQrData({ ...invoice, ksefNumber: meta.KsefNumber }, qrSeed || undefined) : {}),
            };
        }

        // 3. Jeśli mamy tylko referenceNumber - odpytaj KSeF o status
        if (!meta.ReferenceNumber) {
            throw new Error('Brak referenceNumber - faktura nie została poprawnie wysłana');
        }

        // 4. Sprawdź status w KSeF (używamy zapisanego sessionReferenceNumber)
        if (!meta.SessionReferenceNumber) {
            throw new Error('Brak SessionReferenceNumber - nie można sprawdzić statusu');
        }
        
        // Nowa instancja serwisu (fresh token)
        const service = new KsefService();
        const statusResp = await service.getInvoiceStatus(
            meta.ReferenceNumber, 
            meta.SessionReferenceNumber
        );

        // 5. Zaktualizuj metadata jeśli dostaliśmy ksefNumber
        const updateData: any = {
            status: statusResp.status?.code?.toString() || 'UNKNOWN',
            statusDescription: statusResp.status?.description,
        };

        if (statusResp.ksefNumber) {
            updateData.ksefNumber = statusResp.ksefNumber;
            updateData.acquisitionDate = statusResp.acquisitionDate;
            updateData.permanentStorageDate = statusResp.permanentStorageDate;
            updateData.upoDownloadUrl = statusResp.upoDownloadUrl;
            updateData.upoDownloadUrlExpirationDate = statusResp.upoDownloadUrlExpirationDate;

            // Zaktualizuj też główny rekord faktury
            const invoices = await this.repo.find([{ id: invoiceId }]);
            if (invoices[0]) {
                const invoice = invoices[0];
                invoice.ksefNumber = statusResp.ksefNumber;
                invoice.ksefStatus = statusResp.status?.code === 200 ? 'ACCEPTED' : updateData.status;
                await this.repo.editInDb(invoice, undefined, undefined, ['ksefNumber', 'ksefStatus']);
            }
        }

        await KsefMetadataRepository.updateMetadata(invoiceId, updateData);

        const qrInvoice = statusResp.ksefNumber ? await this.loadInvoiceWithItems(invoiceId) : null;
        const qrSeed = this.extractStoredQrSeed(meta);
        const qrData = qrInvoice
            ? this.buildOnlineQrData({ ...qrInvoice, ksefNumber: statusResp.ksefNumber }, qrSeed || undefined)
            : null;

        return {
            invoiceId,
            referenceNumber: meta.ReferenceNumber,
            ksefNumber: statusResp.ksefNumber || null,
            status: statusResp.status,
            acquisitionDate: statusResp.acquisitionDate,
            invoicingDate: statusResp.invoicingDate,
            upoDownloadUrl: statusResp.upoDownloadUrl,
            ...(qrData || {}),
        };
    }

    /**
     * Pobiera UPO (Urzędowe Poświadczenie Odbioru) dla faktury
     * 
     * Flow pobierania UPO:
     * 1. Jeśli mamy ważny upoDownloadUrl - użyj go (najszybsze, bez autoryzacji)
     * 2. Jeśli URL wygasł lub brak - odpytaj status żeby uzyskać nowy URL
     * 3. Pobierz UPO z nowego URL
     * 
     * @param invoiceId - ID faktury w systemie
     * @returns Buffer z plikiem UPO (XML)
     */
    static async downloadUpoByInvoiceId(invoiceId: number): Promise<Buffer> {
        let meta = await KsefMetadataRepository.findByInvoiceId(invoiceId);
        if (!meta) {
            throw new Error(`Faktura ${invoiceId} nie była wysłana do KSeF`);
        }

        if (!meta.KsefNumber) {
            throw new Error('Brak numeru KSeF - sprawdź najpierw status faktury');
        }

        // 1. Preferuj bezpośredni URL jeśli dostępny i ważny
        if (meta.UpoDownloadUrl && meta.UpoDownloadUrlExpirationDate) {
            const expDate = new Date(meta.UpoDownloadUrlExpirationDate);
            if (expDate > new Date()) {
                console.log(`   [KSeF] Pobieranie UPO przez bezpośredni URL (ważny do ${expDate.toISOString()})`);
                const service = new KsefService();
                return await service.downloadUpoFromUrl(meta.UpoDownloadUrl);
            }
            console.log('   [KSeF] URL UPO wygasł, odpytuję o nowy...');
        }

        // 2. URL wygasł lub nie mamy - odpytaj status żeby uzyskać nowy URL
        if (!meta.SessionReferenceNumber || !meta.ReferenceNumber) {
            throw new Error('Brak danych sesji - nie można uzyskać nowego URL UPO');
        }

        const service = new KsefService();
        const statusResp = await service.getInvoiceStatus(
            meta.ReferenceNumber, 
            meta.SessionReferenceNumber
        );

        // 3. Zaktualizuj metadata z nowym URL
        if (statusResp.upoDownloadUrl) {
            await KsefMetadataRepository.updateMetadata(invoiceId, {
                upoDownloadUrl: statusResp.upoDownloadUrl,
                upoDownloadUrlExpirationDate: statusResp.upoDownloadUrlExpirationDate,
            });
            
            console.log(`   [KSeF] Uzyskano nowy URL UPO, pobieranie...`);
            return await service.downloadUpoFromUrl(statusResp.upoDownloadUrl);
        }

        // 4. Fallback: pobierz przez endpoint sesyjny
        console.log('   [KSeF] Brak URL UPO, próba przez endpoint sesyjny...');
        return await service.downloadUpoByKsefNumber(meta.KsefNumber, meta.SessionReferenceNumber);
    }

    /**
     * Pobiera XML faktury z KSeF (po numerze KSeF)
     */
    static async getInvoiceXmlByInvoiceId(invoiceId: number): Promise<string> {
        const meta = await KsefMetadataRepository.findByInvoiceId(invoiceId);
        if (!meta?.KsefNumber) {
            throw new Error('Brak numeru KSeF dla tej faktury');
        }
        
        // Nowa instancja serwisu (fresh token)
        const service = new KsefService();
        const resp = await service.getInvoiceByKsefNumber(meta.KsefNumber);
        if (!resp.invoiceXml) {
            throw new Error('Brak XML faktury w odpowiedzi KSeF');
        }
        return resp.invoiceXml;
    }

    /**
     * Generuje podgląd XML KSeF na podstawie aktualnych danych faktury w systemie
     * (bez wysyłania do API KSeF).
     */
    static async generatePreviewXmlByInvoiceId(
        invoiceId: number,
        correctionType?: 1 | 2 | 3,
    ): Promise<string> {
        const invoices = await this.repo.find([{ id: invoiceId }]);
        const invoice = invoices[0];
        if (!invoice) {
            throw new Error(`Faktura ${invoiceId} nie znaleziona`);
        }

        if (!invoice._items || invoice._items.length === 0) {
            invoice._items = await InvoiceItemsController.find([{ invoiceId }]);
        }

        InvoiceKsefValidator.validateForKsef(invoice as any);

        if (!invoice.correctedInvoiceId) {
            return KsefXmlBuilder.buildXml(invoice);
        }

        const originalInvoices = await this.repo.find([
            { id: invoice.correctedInvoiceId },
        ]);
        const originalInvoice = originalInvoices[0];

        const originalIssueDate = originalInvoice?.issueDate
            ? new Date(originalInvoice.issueDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

        const originalInvoiceData: OriginalInvoiceData = {
            ksefNumber:
                originalInvoice?.ksefNumber ||
                invoice.ksefNumber ||
                'BRAK_NUMERU_KSEF',
            invoiceNumber:
                originalInvoice?.number ||
                `FV/${originalInvoice?.id || invoice.correctedInvoiceId}`,
            issueDate: originalIssueDate,
        };

        const invoiceCorrectionType = Number((invoice as any).ksefCorrectionType);
        const resolvedCorrectionType =
            correctionType ??
            ([1, 2, 3].includes(invoiceCorrectionType)
                ? (invoiceCorrectionType as 1 | 2 | 3)
                : undefined);

        return KsefXmlBuilder.buildCorrectionXml(
            invoice,
            originalInvoiceData,
            invoice.correctionReason || 'Korekta faktury',
            resolvedCorrectionType,
        );
    }
}
