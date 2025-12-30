import Invoice from '../Invoice';
import ToolsDb from '../../tools/ToolsDb';

/**
 * Generator XML faktur w formacie FA(2) dla KSeF
 * 
 * Zgodny ze schematem: http://crd.gov.pl/wzor/2023/06/29/12648/
 * Wersja schematu: 1-0E
 * 
 * Dokumentacja: https://github.com/CIRFMF/ksef-docs/blob/main/faktury/schemy/FA/schemat_FA(2)_v1-0E.xsd
 */
export default class KsefXmlBuilder {
    private static readonly FA_NAMESPACE = 'http://crd.gov.pl/wzor/2023/06/29/12648/';
    private static readonly ETD_NAMESPACE = 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';
    private static readonly XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
    private static readonly SCHEMA_VERSION = '1-0E';
    private static readonly FORM_CODE_SYSTEM = 'FA (2)';  // Atrybut kodSystemowy
    private static readonly FORM_CODE_VALUE = 'FA';        // Treść elementu KodFormularza (wg TKodFormularza enum)
    private static readonly VARIANT = '2';

    /**
     * Buduje XML faktury zgodny ze schematem FA(2) v1-0E
     */
    static buildXml(invoice: Invoice): string {
        // Dane sprzedawcy z konfiguracji
        const sellerNip = process.env.KSEF_NIP || '';
        const sellerName = process.env.KSEF_SELLER_NAME || 'ENVI Sp. z o.o.';
        const sellerStreet = process.env.KSEF_SELLER_STREET || 'ul. Lubicz 25';
        const sellerCity = process.env.KSEF_SELLER_CITY || 'Kraków';

        // Dane nabywcy z faktury
        const buyerName = this.escapeXml(invoice._entity?.name || '');
        const buyerNip = invoice._entity?.taxNumber || '';
        const buyerAddress = this.escapeXml(invoice._entity?.address || '');

        // Data i numer faktury
        const issueDate = this.formatDate(invoice.issueDate);
        const invoiceNumber = invoice.number || `FV/${invoice.id}/${new Date().getFullYear()}`;
        const creationDateTime = this.formatDateTime(new Date());

        // Pozycje faktury i sumy
        const items = invoice._items || [];
        const { itemsXml, vatSummary } = this.buildItemsXml(items);

        // Oblicz sumy
        const totalGross = this.calculateTotalGross(items, vatSummary);
        const vatSections = this.buildVatSectionsXml(vatSummary);

        return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${this.FA_NAMESPACE}"
         xmlns:etd="${this.ETD_NAMESPACE}"
         xmlns:xsi="${this.XSI_NAMESPACE}">
    <Naglowek>
        <KodFormularza kodSystemowy="${this.FORM_CODE_SYSTEM}" wersjaSchemy="${this.SCHEMA_VERSION}">${this.FORM_CODE_VALUE}</KodFormularza>
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
    private static buildItemsXml(items: any[]): { itemsXml: string; vatSummary: Map<string, { net: number; vat: number }> } {
        const vatSummary = new Map<string, { net: number; vat: number }>();
        
        let xml = '';
        items.forEach((item, index) => {
            const lineNum = index + 1;
            const name = this.escapeXml(item.description || item.name || '');
            const quantity = item.quantity || 1;
            const unitPrice = item.unitPrice || item.UnitPrice || 0;
            const netValue = item._netValue || item.net || (quantity * unitPrice);
            const vatRate = this.normalizeVatRate(item.vatRate || item._vatRate || 23);
            const vatValue = this.calculateVat(netValue, vatRate);

            // Sumuj dla podsumowania VAT
            const rateKey = vatRate.toString();
            const existing = vatSummary.get(rateKey) || { net: 0, vat: 0 };
            vatSummary.set(rateKey, { 
                net: existing.net + netValue, 
                vat: existing.vat + vatValue 
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
    private static buildVatSectionsXml(vatSummary: Map<string, { net: number; vat: number }>): string {
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
    private static calculateTotalGross(items: any[], vatSummary: Map<string, { net: number; vat: number }>): number {
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
        const rate = typeof vatRate === 'string' ? parseFloat(vatRate) || 0 : vatRate;
        if (rate === 0 || isNaN(rate)) return 0;
        return Math.round(netValue * rate) / 100;
    }

    /**
     * Normalizuje stawkę VAT do formatu KSeF
     */
    private static normalizeVatRate(rate: any): number | string {
        if (typeof rate === 'string') {
            const lower = rate.toLowerCase();
            if (lower === 'zw' || lower === 'zwolniony') return 'zw';
            if (lower === 'np' || lower === 'np.') return 'np';
            return parseFloat(rate) || 23;
        }
        return rate || 23;
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
