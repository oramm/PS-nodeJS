import CostInvoiceRepository from './CostInvoiceRepository';
import CostInvoice, { CostInvoiceItem, CostInvoiceSync, CostInvoiceStatus } from './CostInvoice';
import KsefService, { PurchaseInvoiceListItem } from '../invoices/KSeF/KsefService';
import { XMLParser } from 'fast-xml-parser';
import { extractSaleDateFromFa, extractDueDateFromFa } from './costInvoiceXmlHelpers';

export class CostInvoiceError extends Error {
    statusCode: number;
    details?: string[];

    constructor(statusCode: number, message: string, details?: string[]) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}

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
        let skipped = 0;

        // KsefService - będziemy go zamykać w finally
        const ksefService = new KsefService();

        try {
            // 2. Pobierz listę faktur z KSeF
            const invoicesList = await ksefService.fetchAllPurchaseInvoices(dateFrom, dateTo);

            if (invoicesList.length === 0) {
                console.log('[CostInvoice] Brak nowych faktur w podanym okresie');
                await this.repository.completeSync(sync.id!, 'COMPLETED', 0, 0, []);
                return { imported: 0, skipped: 0, errors: [], syncId: sync.id! };
            }

            // 3. Sprawdź które faktury już istnieją (deduplikacja)
            const ksefNumbers = invoicesList.map((i) => i.ksefNumber);
            const existingNumbers = await this.repository.findExistingKsefNumbers(ksefNumbers);

            console.log(`[CostInvoice] Znaleziono ${invoicesList.length} faktur, ${existingNumbers.size} już istnieje`);

            // 4. Importuj nowe faktury
            for (const invoiceInfo of invoicesList) {
                if (existingNumbers.has(invoiceInfo.ksefNumber)) {
                    skipped++;
                    continue;
                }

                try {
                    // Pobierz XML faktury
                    const xml = await ksefService.getInvoiceXml(invoiceInfo.ksefNumber);

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
                    const errorMsg = `Błąd importu ${invoiceInfo.ksefNumber}: ${err.message}`;
                    console.error(`[CostInvoice] ❌ ${errorMsg}`);
                    errors.push(errorMsg);
                }
            }

            // 5. Zakończ synchronizację
            await this.repository.completeSync(sync.id!, 'COMPLETED', imported, skipped, errors);

            console.log(`[CostInvoice] Sync zakończona: ${imported} zaimportowanych, ${skipped} pominięte, ${errors.length} błędów`);

            return { imported, skipped, errors, syncId: sync.id! };
        } catch (err: any) {
            const errorMsg = `Sync failed: ${err.message}`;
            console.error(`[CostInvoice] ❌ ${errorMsg}`);
            errors.push(errorMsg);

            await this.repository.completeSync(sync.id!, 'FAILED', imported, skipped, errors);

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

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            removeNSPrefix: true,
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
        const saleDate = extractSaleDateFromFa(fa, naglowek);
        const dueDate = extractDueDateFromFa(fa);

        // Kwoty
        const podsumowanie = fa.Podsumowanie || {};
        let netAmount = parseDecimal(podsumowanie.WartoscNetto || podsumowanie.WartoscNetto_Faktura);
        let vatAmount = parseDecimal(podsumowanie.WartoscVat || podsumowanie.WartoscVat_Faktura);
        let grossAmount = parseDecimal(podsumowanie.WartoscBrutto || podsumowanie.WartoscBrutto_Faktura);

        // FA(3) - fallback na pola P_13_1 / P_14_1 / P_15 w sekcji Fa
        if (netAmount === 0) netAmount = parseDecimal(fa.P_13_1 || fa.P_13_2 || fa.P_13_3);
        if (vatAmount === 0) vatAmount = parseDecimal(fa.P_14_1 || fa.P_14_2 || fa.P_14_3);
        if (grossAmount === 0) grossAmount = parseDecimal(fa.P_15);

        const currency = fa.KodWaluty || naglowek.KodWaluty || 'PLN';

        // Pozycje faktury
        const items = this.parseInvoiceItems(fa);

        const invoice = new CostInvoice({
            ksefNumber: invoiceInfo.ksefNumber,
            ksefAcquisitionDate: new Date(invoiceInfo.acquisitionTimestamp),
            syncId,
            supplierNip,
            supplierName,
            supplierAddress,
            invoiceNumber: invoiceInfo.invoiceNumber || naglowek.NrFaktury,
            issueDate,
            saleDate,
            dueDate,
            netAmount,
            vatAmount,
            grossAmount,
            currency,
            xmlContent: xml,
            status: 'NEW' as CostInvoiceStatus,
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

        const items: CostInvoiceItem[] = [];
        const faWiersze = fa.FaWiersze || {};
        let wiersze = faWiersze.FaWiersz || fa.FaWiersz || [];

        // Upewnij się że to tablica
        if (!Array.isArray(wiersze)) {
            wiersze = wiersze ? [wiersze] : [];
        }

        let lineNumber = 1;
        for (const wiersz of wiersze) {
            const item = new CostInvoiceItem({
                lineNumber,
                description: wiersz.P_7 || wiersz.NazwaTowaruLubUslugi || 'Brak opisu',
                quantity: parseDecimal(wiersz.P_8B || wiersz.Ilosc, 1),
                unit: wiersz.P_8A || wiersz.JednostkaMiary || 'szt.',
                unitPrice: parseDecimal(wiersz.P_9A || wiersz.CenaJednostkowa),
                netValue: parseDecimal(wiersz.P_11 || wiersz.WartoscNetto),
                vatRate: parseDecimal(wiersz.P_12 || wiersz.StawkaVat, 23),
                vatValue: parseDecimal(wiersz.P_11_1 || wiersz.WartoscVat),
                grossValue: 0, // Oblicz poniżej
                isSelectedForBooking: true,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });

            // Oblicz wartość brutto
            item.grossValue = item.netValue + item.vatValue;

            items.push(item);
            lineNumber++;
        }

        return items;
    }

    /**
     * Wyciągnij NIP z podmiotu
     */
    private extractNip(podmiot: any): string {
        return podmiot.DaneIdentyfikacyjne?.NIP 
            || podmiot.NIP 
            || podmiot.Identyfikator?.NIP 
            || '';
    }

    /**
     * Wyciągnij nazwę z podmiotu
     */
    private extractName(podmiot: any): string {
        const dane = podmiot.DaneIdentyfikacyjne || podmiot;
        return dane.Nazwa || dane.PelnaNazwa || dane.NazwaSkrocona || 'Nieznany dostawca';
    }

    /**
     * Wyciągnij adres z podmiotu
     */
    private extractAddress(podmiot: any): string {
        const adres = podmiot.Adres || podmiot.AdresZamieszkania || {};
        const parts = [
            adres.Ulica,
            adres.NrDomu,
            adres.NrLokalu ? `/${adres.NrLokalu}` : '',
            adres.KodPocztowy,
            adres.Miejscowosc,
        ].filter(Boolean);

        return parts.join(' ').trim() || '';
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
    skipped: number;
    errors: string[];
    syncId: number;
}
