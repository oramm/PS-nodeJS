import Invoice from '../Invoice';
import ToolsDb from '../../tools/ToolsDb';
import Setup from '../../setup/Setup';

/**
 * Interfejs danych oryginalnej faktury wymaganych do korekty
 */
export interface OriginalInvoiceData {
    /** Numer KSeF oryginalnej faktury (format: XXXXXXXXXX-YYYYMMDD-XXXXXX-XXXXXX-XX) */
    ksefNumber: string;
    /** Numer wewnętrzny oryginalnej faktury (np. FV/001/2025) */
    invoiceNumber: string;
    /** Data wystawienia oryginalnej faktury (YYYY-MM-DD) */
    issueDate: string;
}

/**
 * Generator XML faktur w formacie FA(3) dla KSeF
 *
 * Schemat: http://crd.gov.pl/wzor/2025/06/25/13775/
 * Wersja schematu: 1-0E
 * Obowiązuje od: 01.09.2025
 */
export default class KsefXmlBuilder {
    // Konfiguracja schematu FA(3)
    private static readonly NAMESPACE =
        'http://crd.gov.pl/wzor/2025/06/25/13775/';
    private static readonly SYSTEM_CODE = 'FA (3)';
    private static readonly VARIANT = '3';

    private static readonly ETD_NAMESPACE =
        'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';
    private static readonly XSI_NAMESPACE =
        'http://www.w3.org/2001/XMLSchema-instance';
    private static readonly SCHEMA_VERSION = '1-0E';
    private static readonly FORM_CODE_VALUE = 'FA';  // Treść elementu KodFormularza (enum TKodFormularza)

    /**
     * Buduje XML faktury korygującej zgodny ze schematem FA(3)
     * 
     * Schemat FA(3) wymaga dla faktur korygujących (RodzajFaktury=KOR):
     * - PrzyczynaKorekty: przyczyna korekty
     * - TypKorekty: 1=w dacie faktury pierwotnej, 2=w dacie korekty, 3=inna data
     * - DaneFaKorygowanej: dane faktury korygowanej (data, numer, numer KSeF)
     * 
     * @param invoice - Faktura korygująca (pozycje pokazują różnicę: ujemne lub dodatnie)
     * @param originalInvoice - Dane oryginalnej faktury do korekty
     * @param correctionReason - Przyczyna korekty (opcjonalna, domyślnie "Korekta faktury")
     * @param correctionType - Typ skutku korekty: 1=data pierwotna, 2=data korekty (domyślnie 2)
     */
    static buildCorrectionXml(
        invoice: Invoice, 
        originalInvoice: OriginalInvoiceData,
        correctionReason: string = 'Korekta faktury',
        correctionType: 1 | 2 | 3 = 2
    ): string {
        // Dane sprzedawcy z Setup.KSeF (tak samo jak w buildXml)
        const { nip: sellerNip, seller } = Setup.KSeF;
        const sellerName = seller.name || process.env.KSEF_SELLER_NAME || 'ENVI Sp. z o.o.';
        const sellerStreet = seller.street || process.env.KSEF_SELLER_STREET || 'ul. Lubicz 25';
        const sellerCity = seller.city || process.env.KSEF_SELLER_CITY || 'Kraków';

        // Dane nabywcy z faktury korygującej
        const buyerName = this.escapeXml(invoice._entity?.name || '');
        const buyerNip = invoice._entity?.taxNumber || '';
        const buyerAddress = this.escapeXml(invoice._entity?.address || '');

        // Data i numer faktury korygującej
        const issueDate = this.formatDate(invoice.issueDate);
        const invoiceNumber = invoice.number || `FV-K/${invoice.id}/${new Date().getFullYear()}`;
        const creationDateTime = this.formatDateTime(new Date());

        // Dane oryginalnej faktury
        const originalIssueDate = this.formatDate(originalInvoice.issueDate);
        const originalNumber = this.escapeXml(originalInvoice.invoiceNumber);
        const originalKsefNumber = originalInvoice.ksefNumber;

        // Pozycje faktury i sumy
        const items = invoice._items || [];
        const { itemsXml, vatSummary } = this.buildItemsXml(items);

        const totalGross = this.calculateTotalGross(items, vatSummary);
        const vatSections = this.buildVatSectionsXml(vatSummary);

        // Sekcja danych korekty (wymagana gdy RodzajFaktury = KOR, KOR_ZAL, KOR_ROZ)
        const correctionSection = `
        <PrzyczynaKorekty>${this.escapeXml(correctionReason)}</PrzyczynaKorekty>
        <TypKorekty>${correctionType}</TypKorekty>
        <DaneFaKorygowanej>
            <DataWystFaKorygowanej>${originalIssueDate}</DataWystFaKorygowanej>
            <NrFaKorygowanej>${originalNumber}</NrFaKorygowanej>
            <NrKSeF>1</NrKSeF>
            <NrKSeFFaKorygowanej>${originalKsefNumber}</NrKSeFFaKorygowanej>
        </DaneFaKorygowanej>`;

        // Generuj XML faktury korygującej zgodny ze schematem FA(3)
        return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${this.NAMESPACE}"
         xmlns:etd="${this.ETD_NAMESPACE}"
         xmlns:xsi="${this.XSI_NAMESPACE}">
    <Naglowek>
        <KodFormularza kodSystemowy="${this.SYSTEM_CODE}" wersjaSchemy="${this.SCHEMA_VERSION}">${this.FORM_CODE_VALUE}</KodFormularza>
        <WariantFormularza>${this.VARIANT}</WariantFormularza>
        <DataWytworzeniaFa>${creationDateTime}</DataWytworzeniaFa>
        <SystemInfo>ENVI-PS-NodeJS</SystemInfo>
    </Naglowek>
    <Podmiot1>
        <DaneIdentyfikacyjne>
            <NIP>${sellerNip}</NIP>
            <Nazwa>${this.escapeXml(sellerName)}</Nazwa>
        </DaneIdentyfikacyjne>
        <Adres>
            <KodKraju>PL</KodKraju>
            <AdresL1>${this.escapeXml(sellerStreet)}</AdresL1>
            <AdresL2>${this.escapeXml(sellerCity)}</AdresL2>
        </Adres>
    </Podmiot1>
    <Podmiot2>
        <DaneIdentyfikacyjne>${buyerNip ? `
            <NIP>${buyerNip}</NIP>` : `
            <BrakID>1</BrakID>`}
            <Nazwa>${buyerName}</Nazwa>
        </DaneIdentyfikacyjne>${buyerAddress ? `
        <Adres>
            <KodKraju>PL</KodKraju>
            <AdresL1>${buyerAddress}</AdresL1>
        </Adres>` : ''}
        <JST>2</JST>
        <GV>2</GV>
    </Podmiot2>
    <Fa>
        <KodWaluty>PLN</KodWaluty>
        <P_1>${issueDate}</P_1>
        <P_2>${this.escapeXml(invoiceNumber)}</P_2>${vatSections}
        <P_15>${this.formatAmount(totalGross)}</P_15>
        <Adnotacje>
            <P_16>2</P_16>
            <P_17>2</P_17>
            <P_18>2</P_18>
            <P_18A>2</P_18A>
            <Zwolnienie>
                <P_19N>1</P_19N>
            </Zwolnienie>
            <NoweSrodkiTransportu>
                <P_22N>1</P_22N>
            </NoweSrodkiTransportu>
            <P_23>2</P_23>
            <PMarzy>
                <P_PMarzyN>1</P_PMarzyN>
            </PMarzy>
        </Adnotacje>
        <RodzajFaktury>KOR</RodzajFaktury>${correctionSection}${itemsXml}
    </Fa>
</Faktura>`;
    }

    /**
     * Buduje XML faktury zgodny ze schematem FA(3) v1-0E
     */
    static buildXml(invoice: Invoice): string {
        // Dane sprzedawcy z Setup.KSeF (już zwalidowane w InvoiceKsefValidator)
        const { nip: sellerNip, seller } = Setup.KSeF;
        const sellerName = seller.name!;
        const sellerStreet = seller.street!;
        const sellerCity = seller.city!;

        // Dane nabywcy z faktury
        const buyerName = this.escapeXml(invoice._entity?.name || '');
        const buyerNip = invoice._entity?.taxNumber || '';
        const buyerAddress = this.escapeXml(invoice._entity?.address || '');

        // Data i numer faktury
        const issueDate = this.formatDate(invoice.issueDate);
        const invoiceNumber =
            invoice.number || `FV/${invoice.id}/${new Date().getFullYear()}`;
        const creationDateTime = this.formatDateTime(new Date());

        // Pozycje faktury i sumy
        const items = invoice._items || [];
        const { itemsXml, vatSummary } = this.buildItemsXml(items);

        // Oblicz sumy
        const totalGross = this.calculateTotalGross(items, vatSummary);
        const vatSections = this.buildVatSectionsXml(vatSummary);

        return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${this.NAMESPACE}"
         xmlns:etd="${this.ETD_NAMESPACE}"
         xmlns:xsi="${this.XSI_NAMESPACE}">
    <Naglowek>
        <KodFormularza kodSystemowy="${this.SYSTEM_CODE}" wersjaSchemy="${this.SCHEMA_VERSION}">${this.FORM_CODE_VALUE}</KodFormularza>
        <WariantFormularza>${this.VARIANT}</WariantFormularza>
        <DataWytworzeniaFa>${creationDateTime}</DataWytworzeniaFa>
        <SystemInfo>ENVI-PS-NodeJS</SystemInfo>
    </Naglowek>
    <Podmiot1>
        <DaneIdentyfikacyjne>
            <NIP>${sellerNip}</NIP>
            <Nazwa>${this.escapeXml(sellerName)}</Nazwa>
        </DaneIdentyfikacyjne>
        <Adres>
            <KodKraju>PL</KodKraju>
            <AdresL1>${this.escapeXml(sellerStreet)}</AdresL1>
            <AdresL2>${this.escapeXml(sellerCity)}</AdresL2>
        </Adres>
    </Podmiot1>
    <Podmiot2>
        <DaneIdentyfikacyjne>${
            buyerNip
                ? `
            <NIP>${buyerNip}</NIP>`
                : `
            <BrakID>1</BrakID>`
        }
            <Nazwa>${buyerName}</Nazwa>
        </DaneIdentyfikacyjne>${
            buyerAddress
                ? `
        <Adres>
            <KodKraju>PL</KodKraju>
            <AdresL1>${buyerAddress}</AdresL1>
        </Adres>`
                : ''
        }
        <JST>2</JST>
        <GV>2</GV>
    </Podmiot2>
    <Fa>
        <KodWaluty>PLN</KodWaluty>
        <P_1>${issueDate}</P_1>
        <P_2>${this.escapeXml(invoiceNumber)}</P_2>${vatSections}
        <P_15>${this.formatAmount(totalGross)}</P_15>
        <Adnotacje>
            <P_16>2</P_16>
            <P_17>2</P_17>
            <P_18>2</P_18>
            <P_18A>2</P_18A>
            <Zwolnienie>
                <P_19N>1</P_19N>
            </Zwolnienie>
            <NoweSrodkiTransportu>
                <P_22N>1</P_22N>
            </NoweSrodkiTransportu>
            <P_23>2</P_23>
            <PMarzy>
                <P_PMarzyN>1</P_PMarzyN>
            </PMarzy>
        </Adnotacje>
        <RodzajFaktury>VAT</RodzajFaktury>${itemsXml}
    </Fa>
</Faktura>`;
    }

    /**
     * Buduje sekcje XML dla pozycji faktury (FaWiersz)
     */
    private static buildItemsXml(items: any[]): {
        itemsXml: string;
        vatSummary: Map<string, { net: number; vat: number }>;
    } {
        const vatSummary = new Map<string, { net: number; vat: number }>();

        let xml = '';
        items.forEach((item, index) => {
            const lineNum = index + 1;
            const name = this.escapeXml(item.description || item.name || '');
            const quantity = item.quantity || 1;
            const unitPrice = item.unitPrice || item.UnitPrice || 0;
            const netValue = item._netValue || item.net || (quantity * unitPrice);
            // Pobierz stawkę VAT z różnych pól pozycji (vatTax z bazy, vatRate z DTO)
            const vatRate = this.normalizeVatRate(
                item.vatRate ?? item._vatRate ?? item.vatTax ?? item.VatTax ?? 23
            );
            const vatValue = this.calculateVat(netValue, vatRate);

            // Sumuj dla podsumowania VAT
            const rateKey = vatRate.toString();
            const existing = vatSummary.get(rateKey) || { net: 0, vat: 0 };
            vatSummary.set(rateKey, {
                net: existing.net + netValue,
                vat: existing.vat + vatValue,
            });

            xml += `
        <FaWiersz>
            <NrWierszaFa>${lineNum}</NrWierszaFa>
            <P_7>${name}</P_7>
            <P_8A>szt.</P_8A>
            <P_8B>${this.formatQuantity(quantity)}</P_8B>
            <P_9A>${this.formatAmount(unitPrice)}</P_9A>
            <P_11>${this.formatAmount(netValue)}</P_11>
            <P_12>${vatRate}</P_12>
        </FaWiersz>`;
        });

        return { itemsXml: xml, vatSummary };
    }

    /**
     * Buduje sekcje podsumowania VAT (P_13_x, P_14_x)
     */
    private static buildVatSectionsXml(
        vatSummary: Map<string, { net: number; vat: number }>,
    ): string {
        let xml = '';

        // Stawka 23%
        const vat23 = vatSummary.get('23');
        if (vat23 && vat23.net > 0) {
            xml += `
        <P_13_1>${this.formatAmount(vat23.net)}</P_13_1>
        <P_14_1>${this.formatAmount(vat23.vat)}</P_14_1>`;
        }

        // Stawka 8%
        const vat8 = vatSummary.get('8');
        if (vat8 && vat8.net > 0) {
            xml += `
        <P_13_2>${this.formatAmount(vat8.net)}</P_13_2>
        <P_14_2>${this.formatAmount(vat8.vat)}</P_14_2>`;
        }

        // Stawka 5%
        const vat5 = vatSummary.get('5');
        if (vat5 && vat5.net > 0) {
            xml += `
        <P_13_3>${this.formatAmount(vat5.net)}</P_13_3>
        <P_14_3>${this.formatAmount(vat5.vat)}</P_14_3>`;
        }

        // Stawka 0%
        const vat0 = vatSummary.get('0');
        if (vat0 && vat0.net > 0) {
            xml += `
        <P_13_6_1>${this.formatAmount(vat0.net)}</P_13_6_1>`;
        }

        // Stawka ZW (zwolniony)
        const vatZw = vatSummary.get('zw');
        if (vatZw && vatZw.net > 0) {
            xml += `
        <P_13_7>${this.formatAmount(vatZw.net)}</P_13_7>`;
        }

        return xml;
    }

    /**
     * Oblicza sumę brutto
     */
    private static calculateTotalGross(
        items: any[],
        vatSummary: Map<string, { net: number; vat: number }>,
    ): number {
        let totalNet = 0;
        let totalVat = 0;

        for (const [, value] of vatSummary) {
            totalNet += value.net;
            totalVat += value.vat;
        }

        return totalNet + totalVat;
    }

    /**
     * Oblicza VAT od wartości netto
     */
    private static calculateVat(netValue: number, vatRate: number | string): number {
        if (typeof vatRate === 'string') {
            if (vatRate === 'zw' || vatRate === 'np') return 0;
            vatRate = parseFloat(vatRate) || 0;
        }
        if (!vatRate || vatRate === 0 || isNaN(vatRate as number)) return 0;
        return Math.round(netValue * (vatRate as number)) / 100;
    }

    /**
     * Normalizuje stawkę VAT do formatu KSeF
     * Wartości: 23, 8, 5, 0, 'zw', 'np'
     */
    private static normalizeVatRate(rate: any): number | string {
        if (typeof rate === 'string') {
            const lower = rate.trim().toLowerCase().replace('%', '');
            if (lower === 'zw' || lower === 'zwolniony') return 'zw';
            if (lower === 'np' || lower === 'np.') return 'np';
            const numeric = parseFloat(lower);
            if (isNaN(numeric)) return 23;
            rate = numeric;
        }
        
        // Jeśli liczba: konwertuj ułamek (0.08) na procenty (8)
        if (typeof rate === 'number') {
            if (rate < 1 && rate > 0) rate = rate * 100;
            // Zaokrąglij do liczby całkowitej dla standardowych stawek
            const rounded = Math.round(rate);
            return rounded;
        }
        
        return 23;
    }

    /**
     * Formatuje datę do formatu YYYY-MM-DD
     */
    private static formatDate(date: any): string {
        if (!date) return new Date().toISOString().split('T')[0];
        if (typeof date === 'string') {
            if (date.includes('T')) return date.split('T')[0];
            return date.substring(0, 10);
        }
        if (date instanceof Date) {
            return date.toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Formatuje datę i czas do formatu ISO (dla DataWytworzeniaFa)
     */
    private static formatDateTime(date: Date): string {
        return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    /**
     * Formatuje kwotę z 2 miejscami po przecinku
     */
    private static formatAmount(amount: number): string {
        return (Math.round(amount * 100) / 100).toFixed(2);
    }

    /**
     * Formatuje ilość z max 6 miejscami po przecinku
     */
    private static formatQuantity(quantity: number): string {
        const rounded = Math.round(quantity * 1000000) / 1000000;
        return rounded.toString();
    }

    /**
     * Escape XML special characters
     */
    private static escapeXml(str: string): string {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
