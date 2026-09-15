/**
 * Opt-in local integration test. Uses a fresh disposable schema, never production or existing invoice rows.
 * INVOICE_SERIES_DB_TEST=1 yarn test --runInBand src/invoices/__tests__/InvoiceSeries.database.test.ts
 */
jest.mock('../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../tools/ToolsGd', () => ({ __esModule: true, default: { createDocumentOpenUrl: () => 'document' } }));
jest.mock('../../tools/ToolsMail', () => ({ __esModule: true, default: {} }));
jest.mock('../KSeF/KsefController', () => ({ __esModule: true, default: {} }));
jest.mock('../../persons/PersonsController', () => ({
    __esModule: true, default: { getPersonFromSessionUserData: jest.fn(async () => ({ id: 3 })) },
}));
jest.mock('../InvoiceValidator', () => ({
    __esModule: true, default: jest.fn().mockImplementation(() => ({ checkValueWithContract: jest.fn(async () => true) })),
}));
jest.mock('../InvoiceItemValidator', () => ({
    __esModule: true, default: jest.fn().mockImplementation(() => ({ checkValueAgainstContract: jest.fn(async () => true) })),
}));
jest.mock('../../contracts/ContractOur', () => ({
    __esModule: true, default: jest.fn().mockImplementation(value => ({ ...value })),
}));

import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { loadEnv } from '../../setup/loadEnv';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';
import InvoicesController from '../InvoicesController';
import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemRepository from '../InvoiceItemRepository';
import InvoiceItem from '../InvoiceItem';

const run = process.env.INVOICE_SERIES_DB_TEST === '1' ? describe : describe.skip;
run('invoice series on real local InnoDB', () => {
    let admin: mysql.Connection;
    let pool: mysql.Pool;
    let createdSchema = false;
    const schema = 'codex_invoice_series_test_' + randomUUID().replace(/-/g, '');
    const source: any = {
        id: 7, issueDate: '2027-01-31', sentDate: '2027-02-01', number: 'SOURCE',
        status: 'Zapłacona', description: 'Nadzór styczeń', daysToPay: 30,
        paymentStatus: 'PAID', paidAmount: 123, paymentDate: '2027-02-02',
        ksefNumber: 'KSEF', ksefStatus: 'SENT', ksefSessionId: 'SESSION', ksefUpo: 'UPO', gdId: 'DOC',
        _contract: { id: 4, value: 100000 }, _entity: { id: 8 },
        includeThirdParty: true, isJstSubordinate: true,
        _thirdParties: [{ entityId: 9, role: 8, _entity: { id: 9 } }],
    };
    const sourceItem = new InvoiceItem({ id: 10, description: 'Pozycja styczeń', quantity: 2, unitPrice: 50,
        vatTax: 23, _parent: source, _editor: { id: 1 } });
    const input = () => ({ sourceInvoiceId: 7, totalCount: 5, intervalMonths: 1, firstSaleDate: null, requestId: randomUUID() });
    const user = { enviId: 3 } as any;

    beforeAll(async () => {
        process.env.NODE_ENV = 'development';
        loadEnv();
        if (!['127.0.0.1', 'localhost', '::1'].includes(Setup.dbConfig.host || '')) throw Error('Local database required');
        admin = await mysql.createConnection(Setup.dbConfig);
        await admin.query('CREATE DATABASE ' + mysql.escapeId(schema));
        createdSchema = true;
        for (const table of ['Invoices', 'InvoiceItems', 'InvoiceThirdParties', 'Contracts']) {
            await admin.query('CREATE TABLE ' + mysql.escapeId(schema) + '.' + mysql.escapeId(table)
                + ' LIKE ' + mysql.escapeId(Setup.dbConfig.database!) + '.' + mysql.escapeId(table));
        }
        await admin.query('USE ' + mysql.escapeId(schema));
        await admin.query(readFileSync('src/invoices/migrations/011_create_invoice_series_requests.sql', 'utf8'));
        pool = mysql.createPool({ ...Setup.dbConfig, database: schema });
    }, 30000);

    beforeEach(() => {
        jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue(pool);
        jest.spyOn(InvoiceRepository.prototype, 'find').mockImplementation(async () => [source]);
        jest.spyOn(InvoiceItemRepository.prototype, 'find').mockImplementation(async () => [sourceItem]);
    });

    afterAll(async () => {
        if (pool) await pool.end();
        if (admin) {
            if (createdSchema && /^codex_invoice_series_test_[0-9a-f]{32}$/.test(schema))
                await admin.query('DROP DATABASE ' + mysql.escapeId(schema));
            await admin.end();
        }
    });

    it('commits 49 copies once under concurrent double submit, and replays after reconnect', async () => {
        const request = { ...input(), totalCount: 50 };
        const [first, second] = await Promise.all([
            InvoicesController.createSeries(request, user),
            InvoicesController.createSeries(request, user),
        ]);
        expect(first).toEqual(second);
        expect(first.invoiceIds).toHaveLength(49);
        const [rows]: any = await admin.query('SELECT * FROM Invoices ORDER BY Id');
        expect(rows).toHaveLength(49);
        expect(rows[0].IssueDate.toISOString().slice(0, 10)).toBe('2027-02-28');
        expect(rows[1].IssueDate.toISOString().slice(0, 10)).toBe('2027-03-31');
        for (const row of rows) {
            expect(row).toMatchObject({ Number: null, Status: 'Na później', Description: 'Nadzór styczeń',
                SentDate: null, PaymentDeadline: null, PaymentStatus: 'UNPAID', PaidAmount: '0.00',
                PaymentDate: null, KsefNumber: null, KsefSessionId: null, KsefStatus: null, KsefUpo: null, GdId: null });
        }
        const [items]: any = await admin.query('SELECT * FROM InvoiceItems');
        const [parties]: any = await admin.query('SELECT * FROM InvoiceThirdParties');
        expect(items).toHaveLength(49);
        expect(parties).toHaveLength(49);
        await pool.end();
        pool = mysql.createPool({ ...Setup.dbConfig, database: schema });
        jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue(pool);
        expect(await InvoicesController.createSeries(request, user)).toEqual(first);
    }, 30000);

    it('rolls back a later failed insert with no invoice, item, party or receipt left behind', async () => {
        const tables = ['Invoices', 'InvoiceItems', 'InvoiceThirdParties', 'InvoiceSeriesRequests'];
        const counts = async () => Promise.all(tables.map(async table => {
            const [rows]: any = await admin.query('SELECT COUNT(*) AS n FROM ' + mysql.escapeId(table));
            return Number(rows[0].n);
        }));
        const before = await counts();
        const original = InvoiceItemRepository.prototype.addInDb;
        let writes = 0;
        jest.spyOn(InvoiceItemRepository.prototype, 'addInDb').mockImplementation(async function (this: InvoiceItemRepository, ...args) {
            if (++writes === 3) throw Error('injected third-item failure');
            return original.apply(this, args);
        });
        await expect(InvoicesController.createSeries(input(), user)).rejects.toThrow('injected third-item failure');
        expect(await counts()).toEqual(before);
    }, 30000);
});
