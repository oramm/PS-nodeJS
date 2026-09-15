jest.mock('../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../tools/ToolsGd', () => ({ __esModule: true, default: { createDocumentOpenUrl: () => 'document' } }));
jest.mock('../../tools/ToolsMail', () => ({ __esModule: true, default: {} }));
jest.mock('../KSeF/KsefController', () => ({ __esModule: true, default: {} }));
jest.mock('../../persons/PersonsController', () => ({
    __esModule: true, default: { getPersonFromSessionUserData: jest.fn(async () => ({ id: 3, name: 'Test' })) },
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

import InvoicesController from '../InvoicesController';
import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemRepository from '../InvoiceItemRepository';
import ToolsDb from '../../tools/ToolsDb';
import InvoiceValidator from '../InvoiceValidator';

const requestId = '11111111-1111-4111-8111-111111111111';
const input = { sourceInvoiceId: 7, totalCount: 5, intervalMonths: 2, firstSaleDate: null, requestId };
const user = { enviId: 3 } as any;
let source: any;
let item: any;
let persisted: any[];
let staged: any[];
let receipt: any;
let conn: any;
let nextId: number;

beforeEach(() => {
    source = { id: 7, issueDate: '2027-01-15', sentDate: '2027-01-16', number: 'FV/7',
        status: 'Zapłacona', description: 'Styczeń 2027', daysToPay: 30,
        paymentDeadline: '2027-02-15', paymentStatus: 'PAID', paidAmount: 123, paymentDate: '2027-02-01',
        ksefNumber: 'KSEF7', ksefStatus: 'SENT', ksefSessionId: 'SESSION', ksefUpo: 'UPO', ksefCorrectionType: 2,
        correctedInvoiceId: 2, correctionReason: 'Reason', gdId: 'DOC',
        _contract: { id: 4, value: 100000 }, _entity: { id: 8 }, _owner: { id: 1, name: "Test", surname: "Owner", email: "test@example.invalid" },
        includeThirdParty: true, _thirdParties: [{ entityId: 9, role: 8, _entity: { id: 9 } }],
        isJstSubordinate: true, _totalNetValue: 100, _totalGrossValue: 123,
    };
    item = { id: 10, description: 'Nadzór — styczeń', quantity: 2, unitPrice: 50, vatTax: 23,
        _netValue: 100, _parent: source, _editor: { id: 1 } };
    persisted = []; staged = []; receipt = null; nextId = 100;
    conn = {
        beginTransaction: jest.fn(async () => { staged = []; }),
        commit: jest.fn(async () => { persisted.push(...staged); }),
        rollback: jest.fn(async () => { staged = []; receipt = null; }),
        release: jest.fn(),
    };
    jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue({ getConnection: async () => conn } as any);
    jest.spyOn(InvoiceRepository.prototype, 'requireTransactionalSeriesTables').mockResolvedValue();
    jest.spyOn(InvoiceRepository.prototype, 'lockSeriesContract').mockResolvedValue();
    jest.spyOn(InvoiceRepository.prototype, 'claimSeriesRequest').mockImplementation(async (_id, userId, payload, connection) => {
        expect(connection).toBe(conn);
        return receipt ?? { UserId: userId, RequestPayload: payload, InvoiceIds: null };
    });
    jest.spyOn(InvoiceRepository.prototype, 'finishSeriesRequest').mockImplementation(async (_id, ids, connection) => {
        expect(connection).toBe(conn);
        receipt = { UserId: 3, RequestPayload: JSON.stringify({ sourceInvoiceId: 7, totalCount: 5, intervalMonths: 2, firstSaleDate: null }), InvoiceIds: JSON.stringify(ids) };
    });
    jest.spyOn(InvoiceRepository.prototype, 'find').mockImplementation(async () => [source]);
    jest.spyOn(InvoiceItemRepository.prototype, 'find').mockImplementation(async () => [item]);
    jest.spyOn(InvoiceRepository.prototype, 'addInDb').mockImplementation(async (invoice: any, connection) => {
        expect(connection).toBe(conn); invoice.id = nextId++; staged.push({ type: 'invoice', ...invoice }); return invoice;
    });
    jest.spyOn(InvoiceRepository.prototype, 'replaceThirdPartiesInDb').mockImplementation(async (id, parties, connection) => {
        expect(connection).toBe(conn); staged.push({ type: 'parties', id, parties });
    });
    jest.spyOn(InvoiceItemRepository.prototype, 'addInDb').mockImplementation(async (value: any, connection) => {
        expect(connection).toBe(conn); staged.push({ type: 'item', ...value }); return value;
    });
});

it('copies all fields, resets lifecycle data, preserves source and commits exactly once', async () => {
    const before = JSON.stringify(source);
    const result = await InvoicesController.createSeries(input, user);
    expect(result.invoiceIds).toHaveLength(4);
    const copies = persisted.filter(row => row.type === 'invoice');
    expect(copies.map(copy => copy.issueDate)).toEqual(['2027-03-15', '2027-05-15', '2027-07-15', '2027-09-15']);
    for (const copy of copies) {
        expect(copy).toMatchObject({ status: 'Na później', number: null, description: source.description, daysToPay: 30,
            sentDate: null, paymentDeadline: null, paymentStatus: 'UNPAID', paidAmount: 0, paymentDate: null,
            gdId: null, ksefNumber: null, ksefStatus: null, ksefSessionId: null, ksefUpo: null,
            ksefCorrectionType: null, correctedInvoiceId: null, correctionReason: null,
            _entity: source._entity, _contract: source._contract });
        expect(copy._documentOpenUrl).toBeUndefined();
    }
    expect(persisted.filter(row => row.type === 'parties')).toHaveLength(4);
    expect(persisted.filter(row => row.type === 'item')).toHaveLength(4);
    for (const copy of persisted.filter(row => row.type === 'item')) {
        expect(copy).toMatchObject({ description: item.description, quantity: 2, unitPrice: 50, vatTax: 23, _netValue: 100 });
        expect(copy.id).toBeUndefined();
        expect(result.invoiceIds).toContain(copy.parentId);
    }
    expect(JSON.stringify(source)).toBe(before);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
    expect((InvoiceValidator as unknown as jest.Mock).mock.calls.at(-1)[1]._totalNetValue).toBe(400);
});

it('rolls back invoices, items, third parties and receipt if a later item fails', async () => {
    jest.spyOn(InvoiceItemRepository.prototype, 'addInDb')
        .mockImplementationOnce(async (value: any) => { staged.push({ type: 'item' }); return value; })
        .mockRejectedValueOnce(new Error('injected failure'));
    await expect(InvoicesController.createSeries(input, user)).rejects.toThrow('injected failure');
    expect(persisted).toEqual([]);
    expect(staged).toEqual([]);
    expect(receipt).toBeNull();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
});

it('replays a committed request without inserting a second series', async () => {
    const first = await InvoicesController.createSeries(input, user);
    const count = persisted.length;
    const second = await InvoicesController.createSeries(input, user);
    expect(second).toEqual(first);
    expect(persisted).toHaveLength(count);
});

it('rejects reuse with changed parameters', async () => {
    await InvoicesController.createSeries(input, user);
    await expect(InvoicesController.createSeries({ ...input, totalCount: 10 }, user)).rejects.toThrow(/innych danych/);
});

it('preserves the legacy KOPIA description only for ordinary copying', async () => {
    const copy = await InvoicesController.copy(source, user);
    expect(copy.description).toBe('Styczeń 2027 KOPIA');
    expect(copy.paymentStatus).toBe('UNPAID');
    expect(conn.commit).toHaveBeenCalledTimes(1);
});

it('creates 49 copies in one transaction with one batch validation', async () => {
    const result = await InvoicesController.createSeries({ ...input, totalCount: 50, intervalMonths: 1 }, user);
    expect(result.invoiceIds).toHaveLength(49);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect((InvoiceValidator as unknown as jest.Mock).mock.calls.at(-1)[1]._totalNetValue).toBe(4900);
});
