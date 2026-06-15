import CostInvoiceRepository from './CostInvoiceRepository';
import CostInvoice, { CostInvoiceItem, CostInvoiceSync, CostInvoiceStatus, PaymentStatus } from './CostInvoice';
import KsefService, { PurchaseInvoiceListItem } from '../invoices/KSeF/KsefService';
import { XMLParser } from 'fast-xml-parser';
import { extractSaleDateFromFa, extractDueDateFromFa, extractPaymentMethodFromFa, extractPaymentInfoFromFa, extractInvoiceTypeFromFa } from './costInvoiceXmlHelpers';
import { CostInvoiceValidator } from './CostInvoiceValidator';
import Setup from '../setup/Setup';
import * as crypto from 'crypto';

export class CostInvoiceError extends Error {
    statusCode: number;
    details?: string[];

    constructor(statusCode: number, message: string, details?: string[]) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}

export type CostInvoiceQrData = {
    qrVerificationUrl: string;
    qrLabel: string;
    qrPayload: {
        environment: string;
        sellerNip: string;
        issueDate: string;
        invoiceHash: string;
    };
};

type CostInvoiceReparsePreviewItem = {
    id: number;
    ksefNumber: string;
    invoiceNumber: string;
    changes: Record<string, { before: any; after: any }>;
    before: Record<string, any>;
    after: Record<string, any>;
};

/**
 * Controller dla faktur kosztowych
 *
 * Zarządza synchronizacją faktur zakupowych z KSeF oraz ich przeglądaniem i księgowaniem.
 */
export default class CostInvoiceController {
    private repository: CostInvoiceRepository;

    constructor() {
        this.repository = new CostInvoiceRepository();
    }

    private getQrBaseUrl(): string {
        return Setup.KSeF.environment === 'production'
            ? 'https://qr.ksef.mf.gov.pl'
            : 'https://qr-test.ksef.mf.gov.pl';
    }

    private toBase64Url(buffer: Buffer): string {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    private formatQrDate(dateValue: Date): string {
        const date = new Date(dateValue);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // =====================================================
    // SYNCHRONIZACJA Z KSeF
    // =====================================================

    /**
     * Synchronizacja przyrostowa - od ostatniej synchronizacji z buforem 1 dnia
     *
     * @param userId ID użytkownika wykonującego synchronizację
     */
    async syncIncremental(userId?: number): Promise<SyncResult> {
        // 1. Znajdź datę ostatniej synchronizacji
        const lastSync = await this.repository.findLastCompletedSync();

        let dateFrom: Date;
        if (lastSync && lastSync.dateTo) {
            // Od daty końcowej ostatniej synchronizacji MINUS 1 dzień (bufor)
            dateFrom = new Date(lastSync.dateTo);
            dateFrom.setDate(dateFrom.getDate() - 1);
        } else {
            // Pierwsza synchronizacja - ostatnie 30 dni
            dateFrom = new Date();
            dateFrom.setDate(dateFrom.getDate() - 30);
        }

        // Data końcowa = dzisiaj
        const dateTo = new Date();
        dateTo.setHours(23, 59, 59, 999);

        console.log(`[CostInvoice] Sync INCREMENTAL: ${dateFrom.toISOString().split('T')[0]} - ${dateTo.toISOString().split('T')[0]}`);

        return await this.performSync(dateFrom, dateTo, 'INCREMENTAL', userId);
    }

    /**
     * Synchronizacja weryfikacyjna - dla podanego zakresu dat
     *
     * @param dateFrom Data początkowa
     * @param dateTo Data końcowa
     * @param userId ID użytkownika wykonującego synchronizację
     */
    async syncVerification(dateFrom: Date, dateTo: Date, userId?: number): Promise<SyncResult> {
        console.log(`[CostInvoice] Sync VERIFICATION: ${dateFrom.toISOString().split('T')[0]} - ${dateTo.toISOString().split('T')[0]}`);

        return await this.performSync(dateFrom, dateTo, 'VERIFICATION', userId);
    }

    /**
     * Główna metoda synchronizacji
     */
    private async performSync(
        dateFrom: Date,
        dateTo: Date,
        syncType: 'INCREMENTAL' | 'VERIFICATION' | 'FULL',
        userId?: number,
    ): Promise<SyncResult> {
        // 1. Utwórz rekord synchronizacji
        const sync = new CostInvoiceSync({
            startedAt: new Date(),
            dateFrom,
            dateTo,
            syncType,
            status: 'IN_PROGRESS',
            userId,
        });
        sync.id = await this.repository.createSync(sync);

        const errors: string[] = [];
        let imported = 0;
        let alreadyAdded = 0;

        // KsefService - będziemy go zamykać w finally
        const ksefService = new KsefService();

        try {
            // 2. Pobierz listę faktur z KSeF
            const invoicesList = await ksefService.fetchAllPurchaseInvoices(dateFrom, dateTo);

            if (invoicesList.length === 0) {
                console.log('[CostInvoice] Brak nowych faktur w podanym okresie');
                await this.repository.completeSync(sync.id!, 'COMPLETED', 0, 0, []);
                return {
                    imported: 0,
                    alreadyAdded: 0,
                    failedCount: 0,
                    errors: [],
                    syncId: sync.id!,
                };
            }

            // 3. Sprawdź które faktury już istnieją (deduplikacja)
            const ksefNumbers = invoicesList.map((i) => i.ksefNumber);
            const existingNumbers = await this.repository.findExistingKsefNumbers(ksefNumbers);

            console.log(`[CostInvoice] Znaleziono ${invoicesList.length} faktur, ${existingNumbers.size} już istnieje`);

            // 4. Importuj nowe faktury
            for (let idx = 0; idx < invoicesList.length; idx++) {
                const invoiceInfo = invoicesList[idx];
                if (existingNumbers.has(invoiceInfo.ksefNumber)) {
                    alreadyAdded++;
                    continue;
                }

                try {
                    let xml: string;
                    if (invoiceInfo.rawXml != null && invoiceInfo.rawXml !== '') {
                        xml = invoiceInfo.rawXml;
                    } else {
                        // Fallback: XML nie był w paczce eksportu — pobierz osobno (rate limiting)
                        if (idx > 0 && idx % 3 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 4000));
                        }
                        xml = await ksefService.getInvoiceXml(invoiceInfo.ksefNumber);
                    }

                    // Parsuj XML i utwórz obiekt faktury
                    const invoice = this.parseInvoiceXml(xml, invoiceInfo, sync.id!);

                    // Zapisz fakturę
                    const invoiceId = await this.repository.create(invoice);

                    // Zapisz pozycje faktury
                    for (const item of invoice._items || []) {
                        item.costInvoiceId = invoiceId;
                        await this.repository.createItem(item);
                    }

                    imported++;
                    console.log(`[CostInvoice] ✅ Zaimportowano: ${invoiceInfo.invoiceNumber} (${invoiceInfo.ksefNumber})`);
                } catch (err: any) {
                    const rawMessage = err?.message || 'Nieznany błąd';
                    const unknownColumnHint = /Unknown column/i.test(rawMessage)
                        ? ' [Wskazówka: błąd schematu DB - sprawdź migracje i mapowanie kolumn/modelu]'
                        : '';
                    const errorMsg = `Błąd importu ${invoiceInfo.ksefNumber}: ${rawMessage}${unknownColumnHint}`;
                    console.error(`[CostInvoice] ❌ ${errorMsg}`);
                    errors.push(errorMsg);
                }
            }

            // 5. Zakończ synchronizację
            await this.repository.completeSync(sync.id!, 'COMPLETED', imported, alreadyAdded, errors);

            console.log(`[CostInvoice] Sync zakończona: ${imported} zaimportowanych, ${alreadyAdded} już dodane, ${errors.length} błędów`);

            return {
                imported,
                alreadyAdded,
                failedCount: errors.length,
                errors,
                syncId: sync.id!,
            };
        } catch (err: any) {
            const errorMsg = `Sync failed: ${err.message}`;
            console.error(`[CostInvoice] ❌ ${errorMsg}`);
            errors.push(errorMsg);

            await this.repository.completeSync(sync.id!, 'FAILED', imported, alreadyAdded, errors);

            throw err;
        }
        // Nie ma potrzeby zamykania sesji - używamy tylko accessToken, nie sesji interaktywnej
    }

    /**
     * Parsuj XML faktury KSeF do modelu CostInvoice
     */
    private parseInvoiceXml(
        xml: string,
        invoiceInfo: PurchaseInvoiceListItem,
        syncId: number,
    ): CostInvoice {
        const parseDecimal = (value: any): number => {
            if (value === null || value === undefined) return 0;
            const normalized = String(value).replace(',', '.');
            const parsed = parseFloat(normalized);
            return Number.isNaN(parsed) ? 0 : parsed;
        };

        const sumDecimal = (values: any[]): number => {
            const raw = values.reduce((sum: number, value: any) => sum + parseDecimal(value), 0);
            return Math.round(raw * 100) / 100;
        };

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            removeNSPrefix: true,
            // parseTagValue: false keeps all tag values as strings.
            // Without this, fast-xml-parser converts 26-digit IBANs (NrRB) to IEEE-754 floats
            // with precision loss (e.g. "16102036682917000000007667" → 1.6102036682917e+25).
            // parseDecimal() / parseVatRate() already handle string→number conversion where needed.
            parseTagValue: false,
        });

        const parsed = parser.parse(xml);

        // Struktura FA(3) - Faktura
        const faktura = parsed.Faktura || parsed['tns:Faktura'] || {};
        const naglowek = faktura.Fa?.Naglowek || faktura.Naglowek || {};
        const podmiot = faktura.Podmiot1 || {}; // Sprzedawca
        const fa = faktura.Fa || {};

        // Dane sprzedawcy (dostawcy)
        const supplierNip = this.extractNip(podmiot);
        const supplierName = this.extractName(podmiot);
        const supplierAddress = this.extractAddress(podmiot);

        // Daty
        // FA(3): data wystawienia jest w fa.P_1; naglowek.DataWystawienia to starszy wariant
        const issueDate = new Date(fa.P_1 || naglowek.DataWystawienia || invoiceInfo.invoicingDate);
        const saleDate =
            extractSaleDateFromFa(fa, naglowek) ||
            (invoiceInfo.saleDate ? new Date(invoiceInfo.saleDate) : undefined);
        const dueDate =
            extractDueDateFromFa(fa) ||
            (invoiceInfo.dueDate ? new Date(invoiceInfo.dueDate) : undefined);
        const supplierBankAccount =
            this.extractSupplierBankAccount(fa) || invoiceInfo.bankAccount;

        // Forma płatności z XML
        const paymentMethod = extractPaymentMethodFromFa(fa);

        // Rodzaj faktury z XML (FA(3): Fa.RodzajFaktury)
        const invoiceType = extractInvoiceTypeFromFa(fa);

        // Kwoty
        const podsumowanie = fa.Podsumowanie || {};
        let netAmount = parseDecimal(podsumowanie.WartoscNetto || podsumowanie.WartoscNetto_Faktura);
        let vatAmount = parseDecimal(podsumowanie.WartoscVat || podsumowanie.WartoscVat_Faktura);
        let grossAmount = parseDecimal(podsumowanie.WartoscBrutto || podsumowanie.WartoscBrutto_Faktura);

        // FA(3) - fallback na sumy P_13_* / P_14_* / P_15 w sekcji Fa
        if (netAmount === 0) {
            const netFallback = sumDecimal([
                fa.P_13_1,
                fa.P_13_2,
                fa.P_13_3,
                fa.P_13_4,
                fa.P_13_5,
                fa.P_13_6_1,
                fa.P_13_6_2,
                fa.P_13_6_3,
                fa.P_13_7,
                fa.P_13_8,
                fa.P_13_9,
                fa.P_13_10,
            ]);
            if (netFallback !== 0) netAmount = netFallback;
        }

        if (vatAmount === 0) {
            const vatFallback = sumDecimal([
                fa.P_14_1,
                fa.P_14_2,
                fa.P_14_3,
                fa.P_14_4,
                fa.P_14_5,
                fa.P_14_6_1,
                fa.P_14_6_2,
                fa.P_14_6_3,
                fa.P_14_7,
                fa.P_14_8,
                fa.P_14_9,
                fa.P_14_10,
            ]);
            if (vatFallback !== 0) vatAmount = vatFallback;
        }

        if (grossAmount === 0) grossAmount = parseDecimal(fa.P_15);

        const currency = fa.KodWaluty || naglowek.KodWaluty || 'PLN';

        // Pozycje faktury
        const items = this.parseInvoiceItems(fa);

        if (items.length > 0) {
            const netSum = items.reduce((sum, item) => sum + (item.netValue || 0), 0);
            const vatSum = items.reduce((sum, item) => sum + (item.vatValue || 0), 0);
            const grossSum = items.reduce((sum, item) => sum + (item.grossValue || 0), 0);

            if (netAmount === 0 && netSum !== 0) netAmount = netSum;
            if (vatAmount === 0 && vatSum !== 0) vatAmount = vatSum;
            if (grossAmount === 0 && grossSum !== 0) grossAmount = grossSum;
        }

        if (grossAmount === 0 && (netAmount !== 0 || vatAmount !== 0)) {
            grossAmount = netAmount + vatAmount;
        }

        // Status płatności z XML — obsługujemy zarówno Zaplacono=1, jak i wpłaty częściowe.
        const { paymentStatus, paidAmount, paymentDate } = extractPaymentInfoFromFa(fa, grossAmount, netAmount);

        const invoice = new CostInvoice({
            ksefNumber: invoiceInfo.ksefNumber,
            ksefAcquisitionDate: new Date(invoiceInfo.acquisitionTimestamp),
            syncId,
            supplierNip,
            supplierName,
            supplierAddress,
            supplierBankAccount,
            invoiceNumber: String(fa.P_2 ?? invoiceInfo.invoiceNumber ?? naglowek.NrFaktury ?? '').trim(),
            invoiceType,
            issueDate,
            saleDate,
            dueDate,
            paymentMethod,
            netAmount,
            vatAmount,
            grossAmount,
            currency,
            xmlContent: xml,
            status: 'NEW' as CostInvoiceStatus,
            paymentStatus,
            paidAmount,
            paymentDate,
            bookingPercentage: 100,
            vatDeductionPercentage: 100,
        });

        invoice._items = items;

        return invoice;
    }

    /**
     * Parsuj pozycje faktury z XML
     */
    private parseInvoiceItems(fa: any): CostInvoiceItem[] {
        const parseDecimal = (value: any, fallback = 0): number => {
            if (value === null || value === undefined || value === '') return fallback;
            const normalized = String(value).replace(',', '.');
            const parsed = parseFloat(normalized);
            return Number.isNaN(parsed) ? fallback : parsed;
        };

        const pickValue = (...values: any[]): any =>
            values.find((value) => value !== null && value !== undefined && value !== '');

        const parseVatRate = (value: any, fallback = 23): number => {
            if (value === null || value === undefined || value === '') return fallback;
            if (typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                if (normalized === 'zw' || normalized === 'zw.' || normalized === 'np' || normalized === 'np.') {
                    return 0;
                }
            }
            return parseDecimal(value, fallback);
        };

        const items: CostInvoiceItem[] = [];
        const faWiersze = fa.FaWiersze || {};
        let wiersze = faWiersze.FaWiersz || fa.FaWiersz || [];

        // Upewnij się że to tablica
        if (!Array.isArray(wiersze)) {
            wiersze = wiersze ? [wiersze] : [];
        }

        let lineNumber = 1;
        for (const wiersz of wiersze) {
            // vatValueSpecified distinguishes "explicitly 0 (exempt)" from "field absent → must derive"
            const rawVatPick = pickValue(wiersz.P_11Vat, wiersz.P_11_1, wiersz.WartoscVat);
            const vatValueSpecified = rawVatPick !== undefined;

            const unitPrice = parseDecimal(pickValue(wiersz.P_9A, wiersz.P_9B, wiersz.CenaJednostkowa));
            const grossCandidate = parseDecimal(pickValue(wiersz.P_11A, wiersz.WartoscBrutto));
            let netValue = parseDecimal(pickValue(wiersz.P_11, wiersz.WartoscNetto));
            let vatValue = parseDecimal(rawVatPick);
            const vatRate = parseVatRate(wiersz.P_12 ?? wiersz.StawkaVat, 23);

            if (netValue > 0 && grossCandidate > 0) {
                // Both net (P_11) and gross (P_11A) present — derive VAT from difference
                const diff = Math.round((grossCandidate - netValue) * 100) / 100;
                vatValue = diff > 0 ? diff : 0;
            } else if (grossCandidate > 0 && netValue === 0) {
                if (!vatValueSpecified && vatRate > 0) {
                    // Only gross with a non-zero rate and no explicit VAT amount:
                    // gross price includes VAT → split using the inclusion method
                    vatValue = Math.round(grossCandidate * vatRate / (100 + vatRate) * 100) / 100;
                    netValue = Math.round((grossCandidate - vatValue) * 100) / 100;
                } else {
                    // Explicit VAT (incl. 0 for exempt) or vatRate = 0
                    netValue = Math.round((grossCandidate - vatValue) * 100) / 100;
                    if (netValue < 0) netValue = 0;
                }
            } else if (netValue > 0 && grossCandidate === 0 && !vatValueSpecified && vatRate > 0) {
                // Only net (P_11) with a non-zero rate and no explicit VAT amount → derive VAT
                vatValue = Math.round(netValue * vatRate / 100 * 100) / 100;
            }

            const grossValue = grossCandidate > 0
                ? grossCandidate
                : Math.round((netValue + vatValue) * 100) / 100;

            const item = new CostInvoiceItem({
                lineNumber,
                description: wiersz.P_7 || wiersz.NazwaTowaruLubUslugi || 'Brak opisu',
                quantity: parseDecimal(wiersz.P_8B || wiersz.Ilosc, 1),
                unit: wiersz.P_8A || wiersz.JednostkaMiary || 'szt.',
                unitPrice,
                netValue,
                vatRate,
                vatValue,
                grossValue,
                isSelectedForBooking: true,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });

            items.push(item);
            lineNumber++;
        }

        return items;
    }

    /**
     * Wyciągnij NIP z podmiotu
     */
    private extractNip(podmiot: any): string {
        const raw = podmiot.DaneIdentyfikacyjne?.NIP
            ?? podmiot.NIP
            ?? podmiot.Identyfikator?.NIP
            ?? '';
        // fast-xml-parser parses all-digit values as numbers; coerce to string
        return String(raw).trim();
    }

    /**
     * Wyciągnij nazwę z podmiotu
     */
    private extractName(podmiot: any): string {
        const dane = podmiot.DaneIdentyfikacyjne || podmiot;
        const raw = dane.Nazwa || dane.PelnaNazwa || dane.NazwaSkrocona || 'Nieznany dostawca';
        return String(raw).trim();
    }

    /**
     * Wyciągnij adres z podmiotu
     */
    private extractAddress(podmiot: any): string {
        const adres = podmiot.Adres || podmiot.AdresZamieszkania || {};

        // KSeF FA(3): free-form address lines (AdresL1 / AdresL2)
        if (adres.AdresL1 || adres.AdresL2) {
            return [adres.AdresL1, adres.AdresL2]
                .filter(Boolean)
                .map((s: any) => String(s).trim())
                .join(', ');
        }

        // Structured address (older / non-FA3 formats)
        const parts = [
            adres.Ulica,
            adres.NrDomu,
            adres.NrLokalu ? `/${adres.NrLokalu}` : '',
            adres.KodPocztowy,
            adres.Miejscowosc,
        ].filter(Boolean);

        return parts.join(' ').trim() || '';
    }

    /**
     * Wyciągnij numer rachunku bankowego z sekcji płatności FA(3)
     */
    private extractSupplierBankAccount(fa: any): string | undefined {
        const rachunekBankowy = fa?.Platnosc?.RachunekBankowy;
        if (!rachunekBankowy) {
            return undefined;
        }

        const nrRb = Array.isArray(rachunekBankowy)
            ? rachunekBankowy[0]?.NrRB
            : rachunekBankowy.NrRB;

        if (!nrRb) {
            return undefined;
        }

        // Wyciągnij same cyfry (usuń spacje, myślniki, etc.)
        const digits = String(nrRb).replace(/[^\d]/g, '');

        // Waliduj: polski rachunek = 26 cyfr
        if (digits.length !== 26) {
            console.warn(`[CostInvoice] Invalid bank account length (${digits.length}): ${nrRb}`);
            return undefined;
        }

        // Formatuj: XX XXXX XXXX XXXX XXXX XXXX XXXX
        return digits.replace(/(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4 $5 $6 $7');
    }

    // =====================================================
    // OPERACJE CRUD
    // =====================================================

    /**
     * Pobierz wszystkie faktury z filtrami
     */
    async findAll(filters?: {
        status?: string;
        dateFrom?: Date;
        dateTo?: Date;
        supplierNip?: string;
        categoryId?: number;
        paymentStatus?: string;
        paymentMethod?: string;
    }): Promise<CostInvoice[]> {
        const invoices = await this.repository.findAll(filters);

        // Załaduj pozycje dla każdej faktury
        for (const invoice of invoices) {
            invoice._items = await this.repository.findItemsByInvoiceId(invoice.id!);
        }

        return invoices;
    }

    /**
     * Pobierz fakturę po ID
     */
    async findById(id: number): Promise<CostInvoice | null> {
        const invoice = await this.repository.findById(id);
        if (invoice) {
            invoice._items = await this.repository.findItemsByInvoiceId(invoice.id!);
        }
        return invoice;
    }

    /**
     * Zwraca dane do wygenerowania kodu QR (KSeF) dla faktury kosztowej.
     */
    async getQrData(id: number): Promise<CostInvoiceQrData> {
        const invoice = await this.repository.findById(id);
        if (!invoice) throw new CostInvoiceError(404, `Faktura ${id} nie istnieje`);

        if (!invoice.xmlContent) {
            throw new CostInvoiceError(400, 'Brak oryginalnego XML do wygenerowania kodu QR');
        }

        const supplierNip = (invoice.supplierNip || '').replace(/\D+/g, '');
        if (!supplierNip) {
            throw new CostInvoiceError(400, 'Brak NIP dostawcy do wygenerowania kodu QR');
        }

        if (!invoice.issueDate || isNaN(invoice.issueDate.getTime())) {
            throw new CostInvoiceError(400, 'Brak daty wystawienia do wygenerowania kodu QR');
        }

        const invoiceHash = this.toBase64Url(
            crypto.createHash('sha256').update(Buffer.from(invoice.xmlContent, 'utf-8')).digest(),
        );

        const issueDate = this.formatQrDate(invoice.issueDate);
        const qrVerificationUrl = `${this.getQrBaseUrl()}/invoice/${supplierNip}/${issueDate}/${invoiceHash}`;
        const qrLabel = invoice.ksefNumber || invoice.invoiceNumber || `KSeF-${id}`;

        return {
            qrVerificationUrl,
            qrLabel,
            qrPayload: {
                environment: Setup.KSeF.environment,
                sellerNip: supplierNip,
                issueDate,
                invoiceHash,
            },
        };
    }

    /**
     * Ponownie sparsuj XML z bazy danych i zaktualizuj pola wyprowadzane z XML.
     * Używane do naprawienia faktur zaimportowanych przed wprowadzeniem nowych pól
     * (paymentStatus, paymentMethod, invoiceType, paymentDate).
     */
    async reparseFromXml(id: number): Promise<CostInvoice> {
        const invoice = await this.repository.findById(id);
        if (!invoice) throw new CostInvoiceError(404, `Faktura ${id} nie istnieje`);
        if (!invoice.xmlContent) throw new CostInvoiceError(400, `Faktura ${id} nie ma zapisanego XML`);

        const reparsed = this.extractParsedFieldsFromXml(invoice.xmlContent, invoice.grossAmount);
        const protectedData = this.protectAlreadyPaidPaymentData(invoice, reparsed);
        await this.repository.updateParsedFields(id, protectedData);

        const updated = await this.repository.findById(id);
        return updated!;
    }

    /**
     * Ponownie sparsuj XML dla WSZYSTKICH faktur w bazie.
     * Zwraca liczbę zaktualizowanych rekordów i listę błędów.
     */
    async reparseAllFromXml(): Promise<{ updated: number; errors: string[] }> {
        const all = await this.repository.findAll();
        const errors: string[] = [];
        let updated = 0;

        for (const invoice of all) {
            if (!invoice.xmlContent) continue;
            try {
                const reparsed = this.extractParsedFieldsFromXml(invoice.xmlContent, invoice.grossAmount);
                const protectedData = this.protectAlreadyPaidPaymentData(invoice, reparsed);
                await this.repository.updateParsedFields(invoice.id!, protectedData);
                updated++;
            } catch (err: any) {
                errors.push(`Faktura ${invoice.id} (${invoice.ksefNumber}): ${err.message}`);
            }
        }

        console.log(`[CostInvoice] Reparse zakończony: ${updated} zaktualizowanych, ${errors.length} błędów`);
        return { updated, errors };
    }

    /**
     * Podgląd zmian po reparse XML (nagłówek faktury bez pozycji).
     * Zwraca tylko faktury, w których wykryto różnice.
     */
    async reparsePreviewFromXml(): Promise<{
        scanned: number;
        changed: number;
        errors: string[];
        invoices: CostInvoiceReparsePreviewItem[];
    }> {
        const all = await this.repository.findAll();
        const errors: string[] = [];
        const invoices: CostInvoiceReparsePreviewItem[] = [];

        for (const invoice of all) {
            if (!invoice.id) continue;
            if (!invoice.xmlContent) continue;

            try {
                const reparsed = this.buildReparsedHeaderFromXml(invoice);
                const before = this.normalizeHeaderForDiff(this.toJsonWithoutItems(invoice));
                const after = this.normalizeHeaderForDiff(this.toJsonWithoutItems(reparsed));
                const changes = this.diffObjects(before, after);

                if (Object.keys(changes).length > 0) {
                    invoices.push({
                        id: invoice.id,
                        ksefNumber: invoice.ksefNumber,
                        invoiceNumber: invoice.invoiceNumber,
                        changes,
                        before,
                        after,
                    });
                }
            } catch (err: any) {
                errors.push(`Faktura ${invoice.id} (${invoice.ksefNumber}): ${err.message}`);
            }
        }

        return {
            scanned: all.length,
            changed: invoices.length,
            errors,
            invoices,
        };
    }

    /**
     * Zastosuj reparse XML dla wybranych faktur (per faktura).
     */
    async reparseApplyFromXml(ids: number[]): Promise<{ updated: number; errors: string[] }> {
        const errors: string[] = [];
        let updated = 0;

        for (const id of ids) {
            try {
                const invoice = await this.repository.findById(id);
                if (!invoice) {
                    errors.push(`Faktura ${id}: nie istnieje`);
                    continue;
                }
                if (!invoice.xmlContent) {
                    errors.push(`Faktura ${id} (${invoice.ksefNumber}): brak XML`);
                    continue;
                }

                const reparsed = this.buildReparsedHeaderFromXml(invoice);
                await this.repository.updateReparsedHeader(reparsed);
                if (reparsed._items && reparsed._items.length > 0) {
                    await this.repository.updateItemFinancials(invoice.id!, reparsed._items);
                }
                updated++;
            } catch (err: any) {
                errors.push(`Faktura ${id}: ${err.message}`);
            }
        }

        return { updated, errors };
    }

    /**
     * Wyciąga pola parsowalne z XML (bez tworzenia pełnego obiektu CostInvoice)
     */
    private extractParsedFieldsFromXml(
        xml: string,
        grossAmount: number,
    ): {
        paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NOT_APPLICABLE';
        paidAmount: number;
        paymentDate?: Date;
        paymentMethod?: string;
        invoiceType?: string;
    } {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            removeNSPrefix: true,
            parseTagValue: false,
        });

        const parsed = parser.parse(xml);
        const faktura = parsed.Faktura || parsed['tns:Faktura'] || {};
        const fa = faktura.Fa || {};

        const { paymentStatus, paidAmount, paymentDate } = extractPaymentInfoFromFa(fa, grossAmount);
        const paymentMethod = extractPaymentMethodFromFa(fa);
        const invoiceType = extractInvoiceTypeFromFa(fa);

        return { paymentStatus, paidAmount, paymentDate, paymentMethod, invoiceType };
    }

    /**
     * Nie nadpisuj danych płatności dla rekordów już oznaczonych jako PAID w bazie.
     * Chroni ręcznie utrwalony status przed cofnięciem podczas reparse.
     */
    private protectAlreadyPaidPaymentData(
        currentInvoice: CostInvoice,
        reparsed: {
            paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NOT_APPLICABLE';
            paidAmount: number;
            paymentDate?: Date;
            paymentMethod?: string;
            invoiceType?: string;
        },
    ): {
        paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NOT_APPLICABLE';
        paidAmount: number;
        paymentDate?: Date;
        paymentMethod?: string;
        invoiceType?: string;
    } {
        if (currentInvoice.paymentStatus !== 'PAID') {
            return reparsed;
        }

        return {
            ...reparsed,
            paymentStatus: 'PAID',
            paidAmount: currentInvoice.paidAmount,
            paymentDate: currentInvoice.paymentDate ?? reparsed.paymentDate,
        };
    }

    private buildReparsedHeaderFromXml(current: CostInvoice): CostInvoice {
        if (!current.xmlContent) {
            throw new Error('Brak XML do reparse');
        }

        const acquisitionDate = current.ksefAcquisitionDate || current.issueDate || new Date();
        const invoiceInfo: PurchaseInvoiceListItem = {
            ksefNumber: current.ksefNumber,
            ksefReferenceNumber: current.ksefNumber,
            subjectNip: current.supplierNip || '',
            subjectName: current.supplierName || '',
            invoiceNumber: current.invoiceNumber || '',
            invoicingDate: current.issueDate ? current.issueDate.toISOString() : new Date().toISOString(),
            saleDate: current.saleDate ? current.saleDate.toISOString() : undefined,
            dueDate: current.dueDate ? current.dueDate.toISOString() : undefined,
            bankAccount: current.supplierBankAccount,
            acquisitionTimestamp: acquisitionDate.toISOString(),
            invoiceType: current.invoiceType || '',
            grossValue: current.grossAmount,
            currency: current.currency || 'PLN',
            rawXml: current.xmlContent,
        };

        const reparsed = this.parseInvoiceXml(
            current.xmlContent,
            invoiceInfo,
            current.syncId ?? 0,
        );

        const protectedPayment = this.protectAlreadyPaidPaymentData(current, {
            paymentStatus: reparsed.paymentStatus,
            paidAmount: reparsed.paidAmount,
            paymentDate: reparsed.paymentDate,
            paymentMethod: reparsed.paymentMethod,
            invoiceType: reparsed.invoiceType,
        });

        reparsed.paymentStatus = protectedPayment.paymentStatus;
        reparsed.paidAmount = protectedPayment.paidAmount;
        reparsed.paymentDate = protectedPayment.paymentDate;
        reparsed.paymentMethod = protectedPayment.paymentMethod;
        reparsed.invoiceType = protectedPayment.invoiceType;

        reparsed.id = current.id;
        reparsed.ksefNumber = current.ksefNumber;
        reparsed.ksefAcquisitionDate = current.ksefAcquisitionDate;
        reparsed.syncId = current.syncId;
        reparsed.status = current.status;
        reparsed.bookingPercentage = current.bookingPercentage;
        reparsed.vatDeductionPercentage = current.vatDeductionPercentage;
        reparsed.categoryId = current.categoryId;
        reparsed.bookedBy = current.bookedBy;
        reparsed.bookedAt = current.bookedAt;
        reparsed.notes = current.notes;
        reparsed.createdAt = current.createdAt;
        reparsed.updatedAt = current.updatedAt;
        reparsed._category = current._category;
        return reparsed;
    }

    private toJsonWithoutItems(invoice: CostInvoice): Record<string, any> {
        const json = invoice.toJson();
        delete json._items;
        return json;
    }

    private normalizeHeaderForDiff(data: Record<string, any>): Record<string, any> {
        const normalized = { ...data };

        // Coerce string fields: XML parser returns all-digit values as numbers (NIP, numeric invoice numbers).
        // Treat empty/null/undefined as null for stable comparison.
        const stringFields = [
            'supplierNip',
            'supplierName',
            'supplierAddress',
            'supplierBankAccount',
            'invoiceNumber',
            'invoiceType',
            'paymentMethod',
            'currency',
        ];
        stringFields.forEach((key) => {
            const val = normalized[key];
            const str = (val !== null && val !== undefined) ? String(val).trim() : '';
            normalized[key] = str || null;
        });

        // Normalize optional date fields
        const dateFields = ['saleDate', 'dueDate', 'paymentDate'];
        dateFields.forEach((key) => {
            if (normalized[key] === '' || normalized[key] === undefined) {
                normalized[key] = null;
            }
        });

        // Round monetary amounts to 2 dp to avoid IEEE 754 comparison noise
        const amountFields = ['netAmount', 'vatAmount', 'grossAmount', 'paidAmount', 'bookableNetAmount', 'deductibleVatAmount'];
        amountFields.forEach((key) => {
            if (typeof normalized[key] === 'number') {
                normalized[key] = Math.round(normalized[key] * 100) / 100;
            }
        });

        return normalized;
    }

    private diffObjects(
        before: Record<string, any>,
        after: Record<string, any>,
    ): Record<string, { before: any; after: any }> {
        const changes: Record<string, { before: any; after: any }> = {};
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

        keys.forEach((key) => {
            if (!this.deepEqual(before[key], after[key])) {
                changes[key] = { before: before[key], after: after[key] };
            }
        });

        return changes;
    }

    private deepEqual(left: any, right: any): boolean {
        if (left === right) return true;
        if (left === null || right === null || left === undefined || right === undefined) {
            return left === right;
        }

        if (Array.isArray(left) && Array.isArray(right)) {
            if (left.length !== right.length) return false;
            for (let i = 0; i < left.length; i++) {
                if (!this.deepEqual(left[i], right[i])) return false;
            }
            return true;
        }

        if (this.isPlainObject(left) && this.isPlainObject(right)) {
            const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
            for (const key of keys) {
                if (!this.deepEqual(left[key], right[key])) return false;
            }
            return true;
        }

        return false;
    }

    private isPlainObject(value: any): value is Record<string, any> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * Waliduj możliwość księgowania faktury i zwróć listę błędów
     */
    async validateBooking(id: number): Promise<{ ok: boolean; errors: string[] }> {
        const invoice = await this.getInvoiceWithItemsOrThrow(id);

        try {
            this.ensureBookingAllowed(invoice);
            this.validateBookingData(invoice);
            return { ok: true, errors: [] };
        } catch (error: any) {
            if (error instanceof CostInvoiceError && Array.isArray(error.details)) {
                return { ok: false, errors: error.details };
            }
            if (error instanceof CostInvoiceError) {
                return { ok: false, errors: [error.message] };
            }
            throw error;
        }
    }

    /**
     * Aktualizuj ustawienia księgowania faktury
     */
    async updateBookingSettings(
        id: number,
        settings: {
            status?: CostInvoiceStatus | string;
            bookingPercentage?: number | string;
            vatDeductionPercentage?: number | string;
            categoryId?: number | string;
            notes?: string;
            paymentStatus?: PaymentStatus | string;
            paidAmount?: number | string;
            bookedBy?: number;
        },
    ): Promise<CostInvoice> {
        const invoice = await this.getInvoiceWithItemsOrThrow(id);

        if (settings.status && !['NEW', 'EXCLUDED', 'BOOKED'].includes(settings.status)) {
            throw new CostInvoiceError(400, `Nieprawidłowy status: ${settings.status}`);
        }

        if (settings.status && !invoice.isEditable) {
            throw new CostInvoiceError(400, `Nie można edytować faktury w statusie ${invoice.status}`);
        }

        // Walidacja płatności z kontekstem grossAmount
        if (settings.paymentStatus !== undefined || settings.paidAmount !== undefined) {
            const validationError = CostInvoiceValidator.validatePaymentUpdate(
                {
                    paymentStatus: settings.paymentStatus,
                    paidAmount: settings.paidAmount,
                },
                invoice.grossAmount
            );
            if (validationError) {
                throw new CostInvoiceError(400, validationError);
            }
        }

        const fields: string[] = [];

        if (settings.bookingPercentage !== undefined) {
            const bookingPercentage = this.parsePercentage(settings.bookingPercentage, 'bookingPercentage');
            invoice.bookingPercentage = bookingPercentage;
            fields.push('bookingPercentage');
        }
        if (settings.vatDeductionPercentage !== undefined) {
            const vatDeductionPercentage = this.parsePercentage(settings.vatDeductionPercentage, 'vatDeductionPercentage');
            invoice.vatDeductionPercentage = vatDeductionPercentage;
            fields.push('vatDeductionPercentage');
        }
        if (settings.categoryId !== undefined) {
            invoice.categoryId = this.parseOptionalInt(settings.categoryId, 'categoryId');
            fields.push('categoryId');
        }
        if (settings.notes !== undefined) {
            invoice.notes = settings.notes;
            fields.push('notes');
        }

        // Obsługa płatności - normalizacja i zapis
        if (settings.paymentStatus !== undefined) {
            const paymentStatus = settings.paymentStatus as PaymentStatus;
            invoice.paymentStatus = paymentStatus;
            fields.push('paymentStatus');

            // Automatyczna normalizacja paidAmount na podstawie statusu
            if (paymentStatus === 'UNPAID' || paymentStatus === 'NOT_APPLICABLE') {
                invoice.paidAmount = 0;
                fields.push('paidAmount');
            } else if (paymentStatus === 'PAID') {
                invoice.paidAmount = invoice.grossAmount;
                fields.push('paidAmount');
            }
        }

        if (settings.paidAmount !== undefined) {
            const paidAmount = this.parseDecimal(settings.paidAmount, 'paidAmount');
            invoice.paidAmount = paidAmount;
            if (!fields.includes('paidAmount')) {
                fields.push('paidAmount');
            }
        }

        if (settings.status === 'BOOKED') {
            if (!settings.bookedBy) {
                throw new CostInvoiceError(403, 'Brak uprawnień do księgowania');
            }
            this.ensureBookingAllowed(invoice);
            this.validateBookingData(invoice);

            invoice.status = 'BOOKED';
            invoice.bookedAt = new Date();
            invoice.bookedBy = settings.bookedBy;
            fields.push('status', 'bookedAt', 'bookedBy');
        } else if (settings.status !== undefined) {
            const nextStatus = settings.status as CostInvoiceStatus;
            invoice.status = nextStatus;
            fields.push('status');
        }

        if (fields.length > 0) {
            await this.repository.update(invoice, fields);
        }

        return await this.getInvoiceWithItemsOrThrow(id);
    }

    /**
     * Aktualizuj ustawienia księgowania pozycji faktury
     */
    async updateItemBookingSettings(
        itemId: number,
        invoiceId: number,
        settings: {
            isSelectedForBooking?: boolean;
            bookingPercentage?: number;
            vatDeductionPercentage?: number;
            categoryId?: number;
        },
    ): Promise<void> {
        // Sprawdź czy faktura jest edytowalna
        const invoice = await this.repository.findById(invoiceId);
        if (!invoice) {
            throw new Error(`Faktura o ID ${invoiceId} nie istnieje`);
        }
        if (!invoice.isEditable) {
            throw new Error(`Nie można edytować pozycji faktury w statusie ${invoice.status}`);
        }

        const item = new CostInvoiceItem({ id: itemId });
        const fields: string[] = [];

        if (settings.isSelectedForBooking !== undefined) {
            item.isSelectedForBooking = settings.isSelectedForBooking;
            fields.push('isSelectedForBooking');
        }
        if (settings.bookingPercentage !== undefined) {
            item.bookingPercentage = settings.bookingPercentage;
            fields.push('bookingPercentage');
        }
        if (settings.vatDeductionPercentage !== undefined) {
            item.vatDeductionPercentage = settings.vatDeductionPercentage;
            fields.push('vatDeductionPercentage');
        }
        if (settings.categoryId !== undefined) {
            item.categoryId = settings.categoryId;
            fields.push('categoryId');
        }

        if (fields.length > 0) {
            await this.repository.updateItem(item, fields);
        }
    }

    /**
     * Pobierz wszystkie kategorie
     */
    async getCategories() {
        return await this.repository.findAllCategories();
    }

    private async getInvoiceWithItemsOrThrow(id: number): Promise<CostInvoice> {
        const invoice = await this.repository.findById(id);
        if (!invoice) {
            throw new CostInvoiceError(404, `Faktura o ID ${id} nie istnieje`);
        }
        invoice._items = await this.repository.findItemsByInvoiceId(id);
        return invoice;
    }

    private parsePercentage(value: number | string, fieldName: string): number {
        const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
        if (typeof parsed !== 'number' || Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
            throw new CostInvoiceError(400, `Nieprawidłowa wartość ${fieldName} (0-100)`);
        }
        return parsed;
    }

    private parseDecimal(value: number | string, fieldName: string): number {
        const parsed = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : value;
        if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
            throw new CostInvoiceError(400, `Nieprawidłowa wartość ${fieldName}`);
        }
        return parsed;
    }

    private parseOptionalInt(value: number | string, fieldName: string): number | undefined {
        if (value === null || value === undefined || value === '') return undefined;
        const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new CostInvoiceError(400, `Nieprawidłowa wartość ${fieldName}`);
        }
        return parsed;
    }

    private ensureBookingAllowed(invoice: CostInvoice) {
        if (invoice.status === 'BOOKED') {
            throw new CostInvoiceError(400, 'Faktura jest już zaksięgowana');
        }
        if (invoice.status !== 'NEW') {
            throw new CostInvoiceError(400, `Nie można zaksięgować faktury w statusie ${invoice.status}`);
        }
    }

    private validateBookingData(invoice: CostInvoice) {
        const errors: string[] = [];
        const items = invoice._items || [];
        const selectedItems = items.filter((item) => item.isSelectedForBooking);

        if (!this.isValidPercentage(invoice.bookingPercentage)) {
            errors.push('Brak lub nieprawidłowy bookingPercentage (0-100)');
        }
        if (!this.isValidPercentage(invoice.vatDeductionPercentage)) {
            errors.push('Brak lub nieprawidłowy vatDeductionPercentage (0-100)');
        }

        if (items.length > 0) {
            if (selectedItems.length === 0) {
                errors.push('Brak pozycji zaznaczonych do księgowania');
            }

            for (const item of selectedItems) {
                if (!this.isValidPercentage(item.bookingPercentage)) {
                    errors.push(`Pozycja ${item.lineNumber}: nieprawidłowy bookingPercentage (0-100)`);
                }
                if (!this.isValidPercentage(item.vatDeductionPercentage)) {
                    errors.push(`Pozycja ${item.lineNumber}: nieprawidłowy vatDeductionPercentage (0-100)`);
                }
                if (!item.categoryId && !invoice.categoryId) {
                    errors.push(`Pozycja ${item.lineNumber}: brak kategorii księgowania`);
                }
            }
        } else {
            if (!invoice.categoryId) {
                errors.push('Brak kategorii księgowania');
            }
        }

        if (errors.length > 0) {
            throw new CostInvoiceError(400, 'Nie można zaksięgować faktury - błędy walidacji', errors);
        }
    }

    private isValidPercentage(value: unknown): boolean {
        if (value === null || value === undefined) return false;
        const parsed = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : value;
        return typeof parsed === 'number' && !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;
    }
}

// =====================================================
// TYPY POMOCNICZE
// =====================================================

export interface SyncResult {
    imported: number;
    alreadyAdded: number;
    failedCount: number;
    errors: string[];
    syncId: number;
}
