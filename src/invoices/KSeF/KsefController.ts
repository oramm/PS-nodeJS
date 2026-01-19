import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemsController from '../InvoiceItemsController';
import KsefService from './KsefService';
import KsefXmlBuilder from './KsefXmlBuilder';
import InvoiceKsefValidator from './InvoiceKsefValidator';
import KsefMetadataRepository from './KsefMetadataRepository';
import Setup from '../../setup/Setup';

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

        // 6. Zapisz metadata - referenceNumber (jeszcze nie mamy ksefNumber!)
        const meta = {
            invoiceId,
            referenceNumber: resp.referenceNumber,
            sessionReferenceNumber: service.getSessionReferenceNumber(),
            status: 'PENDING', // Oczekuje na przetworzenie
            submittedAt: new Date(),
            responseRaw: resp,
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
            return {
                invoiceId,
                ksefNumber: meta.KsefNumber,
                status: meta.Status,
                acquisitionDate: meta.AcquisitionDate,
                upoDownloadUrl: meta.UpoDownloadUrl,
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

        return {
            invoiceId,
            referenceNumber: meta.ReferenceNumber,
            ksefNumber: statusResp.ksefNumber || null,
            status: statusResp.status,
            acquisitionDate: statusResp.acquisitionDate,
            invoicingDate: statusResp.invoicingDate,
            upoDownloadUrl: statusResp.upoDownloadUrl,
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
}
