/**
 * Skrypt backfill: uzupełnia NULL SaleDate / DueDate w tabeli CostInvoices
 * na podstawie zapisanego XmlContent.
 *
 * Użycie:
 *   node build/scripts/backfillSaleAndDueDateFromXml.js            # produkcja
 *   node build/scripts/backfillSaleAndDueDateFromXml.js --dry-run  # podgląd bez zapisu
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import ToolsDb from '../tools/ToolsDb';
import { XMLParser } from 'fast-xml-parser';
import { extractSaleDateFromFa, extractDueDateFromFa } from '../costInvoices/costInvoiceXmlHelpers';

const dryRun = process.argv.includes('--dry-run');

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
});

async function main() {
    ToolsDb.initialize();

    const rows = (await ToolsDb.getQueryCallbackAsync(`
        SELECT Id, XmlContent, SaleDate, DueDate
        FROM CostInvoices
        WHERE XmlContent IS NOT NULL
          AND (SaleDate IS NULL OR DueDate IS NULL)
    `)) as any[];

    console.log(`[backfill] Znaleziono ${rows.length} rekordów do sprawdzenia${dryRun ? ' [DRY RUN]' : ''}`);

    let updatedSale = 0;
    let updatedDue = 0;
    let errors = 0;

    for (const row of rows) {
        try {
            const parsed = parser.parse(row.XmlContent as string);
            const faktura = parsed.Faktura || parsed['tns:Faktura'] || {};
            const fa = faktura.Fa || {};
            const naglowek = faktura.Fa?.Naglowek || faktura.Naglowek || {};

            const fields: string[] = [];
            const params: any[] = [];

            if (row.SaleDate === null) {
                const saleDate = extractSaleDateFromFa(fa, naglowek);
                if (saleDate) {
                    fields.push('SaleDate = ?');
                    params.push(saleDate);
                    updatedSale++;
                }
            }
            if (row.DueDate === null) {
                const dueDate = extractDueDateFromFa(fa);
                if (dueDate) {
                    fields.push('DueDate = ?');
                    params.push(dueDate);
                    updatedDue++;
                }
            }

            if (fields.length > 0 && !dryRun) {
                await ToolsDb.executeSQL(
                    `UPDATE CostInvoices SET ${fields.join(', ')} WHERE Id = ?`,
                    [...params, row.Id],
                );
            }
        } catch (e) {
            console.error(`[backfill] Błąd dla Id=${row.Id}:`, e);
            errors++;
        }
    }

    console.log(
        `[backfill] Scanned: ${rows.length} | updatedSale: ${updatedSale} | updatedDue: ${updatedDue} | errors: ${errors}${dryRun ? ' [DRY RUN]' : ''}`,
    );
    process.exit(errors > 0 ? 1 : 0);
}

main();
