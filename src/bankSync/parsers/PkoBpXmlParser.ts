import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'crypto';
import {
    extractCounterpartyAccount,
    extractCounterpartyName,
    extractNip,
    extractTitle,
    extractInvoiceNumbers,
} from './pkoBpDescriptionHelpers';

export interface PkoBpOperation {
    orderDate: string | null;
    execDate: string;
    operationType: string;
    description: string;
    amount: number;
    currency: string;
    endingBalance: number | null;
    direction: 'IN' | 'OUT';
    counterpartyAccount: string | null;
    counterpartyName: string | null;
    counterpartyNip: string | null;
    title: string | null;
    invoiceNumbers: string[];
    operationHash: string;
}

export interface PkoBpStatement {
    ourAccount: string;
    periodFrom: string;
    periodTo: string;
    operations: PkoBpOperation[];
}

function parseAmount(raw: unknown): number {
    if (raw === null || raw === undefined) return 0;
    const str = String(raw).replace('+', '').trim();
    const val = parseFloat(str);
    return isNaN(val) ? 0 : val;
}

function safeString(raw: unknown): string {
    if (raw === null || raw === undefined) return '';
    return String(raw).trim();
}

function computeHash(execDate: string, amount: number, currency: string, description: string): string {
    const payload = `${execDate}|${amount}|${currency}|${description}`;
    return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export class PkoBpXmlParser {
    static parse(xmlBuffer: Buffer): PkoBpStatement {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            // Preserve long digit sequences (account numbers) as strings — they exceed JS safe integer range
            numberParseOptions: { leadingZeros: false, skipLike: /^\d{15,}$/, hex: false },
            isArray: (name) => name === 'operation',
        });

        const doc = parser.parse(xmlBuffer.toString('utf8'));
        const root = doc['account-history'];

        if (!root) {
            throw new Error('Invalid PKO XML: missing <account-history> root element');
        }

        const search = root.search || {};
        const ourAccount = safeString(search.account);

        const dateSince = search.date?.['@_since'] || '';
        const dateTo = search.date?.['@_to'] || '';

        const rawOps: any[] = root.operations?.operation || [];
        const ops = Array.isArray(rawOps) ? rawOps : [rawOps];

        let lastEndingBalance: number | null = null;

        const operations: PkoBpOperation[] = ops.flatMap((op): PkoBpOperation[] => {
            const orderDateRaw = safeString(op['order-date']);
            const execDate = safeString(op['exec-date']);
            if (!execDate) return []; // skip malformed operations without execution date
            const operationType = safeString(op.type);
            const description = safeString(op.description);

            const amountRaw = op.amount?.['#text'] ?? op.amount;
            const currency = op.amount?.['@_curr'] ?? 'PLN';
            const amount = parseAmount(amountRaw);
            const absAmount = Math.abs(amount);
            const direction: 'IN' | 'OUT' = amount >= 0 ? 'IN' : 'OUT';

            const endingBalanceRaw = op['ending-balance']?.['#text'] ?? op['ending-balance'];
            const endingBalance = endingBalanceRaw !== undefined ? parseAmount(endingBalanceRaw) : null;
            if (endingBalance !== null) lastEndingBalance = endingBalance;

            const counterpartyAccount = extractCounterpartyAccount(description);
            const counterpartyName = extractCounterpartyName(description);
            const counterpartyNip = extractNip(description);
            const title = extractTitle(description);
            const invoiceNumbers = extractInvoiceNumbers(description);

            const operationHash = computeHash(execDate, absAmount, String(currency), description);

            return [{
                orderDate: orderDateRaw || null,
                execDate,
                operationType,
                description,
                amount: absAmount,
                currency: String(currency),
                endingBalance,
                direction,
                counterpartyAccount,
                counterpartyName,
                counterpartyNip,
                title,
                invoiceNumbers,
                operationHash,
            }];
        });

        return {
            ourAccount,
            periodFrom: dateSince,
            periodTo: dateTo,
            operations,
        };
    }
}
