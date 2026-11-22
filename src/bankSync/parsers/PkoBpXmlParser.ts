import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createHash } from 'crypto';
import {
    extractCounterpartyAccount,
    extractCounterpartyName,
    extractNip,
    extractTitle,
    extractInvoiceNumbers,
} from './pkoBpDescriptionHelpers';

export interface PkoBpOperation {
    fileOperationNumber: number;
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

interface PkoBpDocument extends Omit<PkoBpStatement, 'operations'> {
    rawOperations: any[];
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

function computeHash(payload: string): string {
    return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function normalizeOperationDate(value: string): string {
    const parts = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (!parts) return value;
    const [, year, month, day] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export class PkoBpXmlParser {
    static parse(xmlBuffer: Buffer): PkoBpStatement {
        return this.parseOperations(this.readDocument(xmlBuffer));
    }

    static readDocument(xmlBuffer: Buffer): PkoBpDocument {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            // Preserve long digit sequences (account numbers) as strings — they exceed JS safe integer range
            numberParseOptions: { leadingZeros: false, skipLike: /^\d{15,}$/, hex: false },
            isArray: (name) => name === 'operation',
        });

        const xml = xmlBuffer.toString('utf8');
        if (XMLValidator.validate(xml) !== true) throw new Error('Nieprawidłowy XML');
        const doc = parser.parse(xml);
        const root = doc['account-history'];

        if (!root) {
            throw new Error('Invalid PKO XML: missing <account-history> root element');
        }

        const search = root.search || {};
        const ourAccount = safeString(search.account);

        const periodFrom = safeString(search.date?.['@_since']);
        const periodTo = safeString(search.date?.['@_to']);
        const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            new Date(date).toJSON()?.slice(0, 10) === date;
        if (!/^\d{26}$/.test(ourAccount) || !validDate(periodFrom) || !validDate(periodTo) || periodFrom > periodTo) {
            throw new Error('Nieprawidłowy rachunek lub okres wyciągu PKO BP');
        }

        return { ourAccount, periodFrom, periodTo, rawOperations: root.operations?.operation ?? [] };
    }

    static parseOperations({ ourAccount, periodFrom, periodTo, rawOperations }: PkoBpDocument): PkoBpStatement {
        const occurrences = new Map<string, number>();

        const operations = rawOperations.flatMap((op, index): PkoBpOperation[] => {
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

            const counterpartyAccount = extractCounterpartyAccount(description);
            const counterpartyName = extractCounterpartyName(description);
            // Przy wpływie identyfikator odbiorcy opisuje naszą firmę.
            const counterpartyNip = extractNip(description, direction === 'IN' ? 'nadawcy' : undefined);
            const title = extractTitle(description);
            const invoiceNumbers = extractInvoiceNumbers(description);

            // PKO also exports full days without balances. Number twins within their group across both formats.
            const legacyHash = computeHash(`${execDate}|${absAmount}|${currency}|${description}`);
            const operationKey = `${ourAccount}|${direction}|${legacyHash}|${orderDateRaw}|${operationType}`;
            const occurrence = (occurrences.get(operationKey) ?? 0) + 1;
            occurrences.set(operationKey, occurrence);
            const operationHash = computeHash(`${occurrence}|${operationKey}`);

            return [{
                fileOperationNumber: index + 1,
                // Keep the source strings in the B6 hash, including for already imported files.
                orderDate: normalizeOperationDate(orderDateRaw) || null,
                execDate: normalizeOperationDate(execDate),
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
            periodFrom,
            periodTo,
            operations,
        };
    }
}
