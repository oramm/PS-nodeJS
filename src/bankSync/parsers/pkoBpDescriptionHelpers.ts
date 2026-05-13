/**
 * Helpers for parsing PKO BP transfer description field.
 *
 * Description format: labeled segments separated by " : "
 *   Rachunek odbiorcy : {26 digits}
 *   Nazwa odbiorcy :  {text}   (note double space after colon)
 *   Tytuł :  {free text}
 *   Numer faktury VAT lub okres płatności zbiorczej :  {number}
 *   Identyfikator odbiorcy : {10 digits}   (NIP)
 *   Kwota VAT : {amount} PLN
 */

export function extractCounterpartyAccount(desc: string): string | null {
    const m = desc.match(/Rachunek\s+(?:odbiorcy|nadawcy)\s*:\s*(\d{26})/);
    return m ? m[1] : null;
}

export function extractCounterpartyName(desc: string): string | null {
    // Stop before next known label keyword, double space, or end of string
    const m = desc.match(
        /Nazwa\s+(?:odbiorcy|nadawcy)\s*:\s{1,3}(.+?)(?=\s+(?:Rachunek|Nazwa|Adres|Tytu[łl]|Numer|Identyfikator|Dodatkowy|Kwota)\s|\s{2,}|$)/i,
    );
    return m ? m[1].trim() : null;
}

export function extractNip(desc: string): string | null {
    const m = desc.match(/Identyfikator\s+(?:odbiorcy|nadawcy)\s*:\s*(\d{10})/);
    return m ? m[1] : null;
}

export function extractTitle(desc: string): string | null {
    const m = desc.match(/Tytu[łl]\s*:\s{1,3}(.+?)(?:\s{2,}|$)/);
    return m ? m[1].trim() : null;
}

export function extractVatAmount(desc: string): number | null {
    const m = desc.match(/Kwota\s+VAT\s*:\s*([\d,\.]+)\s*PLN/);
    if (!m) return null;
    const val = parseFloat(m[1].replace(',', '.'));
    return isNaN(val) ? null : val;
}

/**
 * Extracts invoice numbers from description.
 * Priority: "Numer faktury VAT..." field > "Tytuł" field > regex in raw text.
 * Returns array because one transfer may cover multiple invoices.
 */
export function extractInvoiceNumbers(desc: string): string[] {
    // 1. Structured field: "Numer faktury VAT lub okres płatności zbiorczej :  {number}"
    const structuredMatch = desc.match(
        /Numer\s+faktury\s+VAT[^:]*:\s{1,3}(.+?)(?:\s{2,}|$)/,
    );
    if (structuredMatch) {
        const nums = parseInvoiceNumbersFromText(structuredMatch[1].trim());
        if (nums.length) return nums;
    }

    // 2. "Tytuł" field
    const titleMatch = desc.match(/Tytu[łl]\s*:\s{1,3}(.+?)(?:\s{2,}|$)/);
    if (titleMatch) {
        const nums = parseInvoiceNumbersFromText(titleMatch[1].trim());
        if (nums.length) return nums;
    }

    // 3. Whole description fallback
    return parseInvoiceNumbersFromText(desc);
}

const INVOICE_NUMBER_PATTERNS = [
    /FV\s*[-\/]?\s*\d+(?:[\s\/\.-]\w+)*\/\d{2,4}/gi,
    /FS\s*[-\/]?\s*\d+(?:[\s\/\.-]\w+)*(?:\/\d{2,4})?/gi,
    /FA\s*[-\/]?\s*\d+(?:[\s\/\.-]\w+)*(?:\/\d{2,4})?/gi,
    /\d+\/\d{4}/g,
];

function parseInvoiceNumbersFromText(text: string): string[] {
    const found = new Set<string>();
    for (const pattern of INVOICE_NUMBER_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(text)) !== null) {
            found.add(m[0].trim());
        }
    }
    return Array.from(found);
}
