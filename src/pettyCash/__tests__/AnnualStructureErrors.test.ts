jest.mock('../../index', () => ({ app: { use: jest.fn(), get: jest.fn(), post: jest.fn() }, upload: { single: jest.fn() } }));
jest.mock('../../setup/Setup', () => ({ __esModule: true, default: { PettyCash: { spreadsheetId: 'fake-cash', registerSpreadsheetId: 'fake-postal' } } }));
jest.mock('../documents/ReceiptAnalyzer', () => ({ __esModule: true, default: {} }));
jest.mock('../sheets/sheetsAuth', () => ({ __esModule: true, default: jest.fn().mockResolvedValue({}) }));
jest.mock('../../tools/ToolsSheets', () => ({ __esModule: true, default: { getSpreadSheet: jest.fn(), getValues: jest.fn(), batchUpdateSheet: jest.fn() } }));
import { app } from '../../index';
import ToolsSheets from '../../tools/ToolsSheets';

let route: any;
beforeAll(() => {
    require('../PettyCashRouter');
    route = (app.post as jest.Mock).mock.calls.find(c => c[0] === '/pettyCash/entries')![1];
});
const cashDto = { entryKind: 'ADVANCE', entryDate: '2027-01-01', description: 'test', inflowAmount: '100', payerLabel: 'TEST', settlementMethod: 'ADVANCE' };
const postalDto = { entryKind: 'POSTAL', entryDate: '2027-01-01', description: 'poczta - listy', netAmount: '10', grossAmount: '10', documentNumber: 'TEST-1', payerLabel: 'TEST', settlementMethod: 'CASH', dispatch: { invoiceNumber: 'TEST-1', items: [{ trackingNumber: '000000000000000000', addressee: 'Test', amount: '10' }] } };
it.each([
    ['cash', cashDto, 'ANNUAL_SHEET_MISSING', []],
    ['postal', postalDto, 'ANNUAL_SHEET_MISSING', []],
    ['cash', cashDto, 'ANNUAL_SHEET_INCOMPLETE', [{ properties: { sheetId: 0, title: 'zaliczki 2027' } }]],
    ['postal', postalDto, 'ANNUAL_SHEET_INCOMPLETE', [{ properties: { sheetId: 0, title: 'poczta wych. 2027' } }]],
])('%s %s returns actionable typed failure without any write', async (module, dto, code, sheets) => {
    (ToolsSheets.getSpreadSheet as jest.Mock).mockResolvedValue({ data: { sheets } });
    (ToolsSheets.getValues as jest.Mock).mockResolvedValue({ values: [] });
    const res: any = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res);
    const next = jest.fn();
    await route({ body: dto }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code, module, year: 2027, error: expect.any(String) }));
    expect(ToolsSheets.batchUpdateSheet).not.toHaveBeenCalled();
});
import Controller, { PostalCommitError } from '../PettyCashEntryController';
it('returns precise postal-only outcome without forwarding transport details', async () => {
    const spy = jest.spyOn(Controller, 'addFromDto').mockRejectedValueOnce(new PostalCommitError({ register: 'complete', cash: 'absent' }));
    const res: any = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res);
    const next = jest.fn();
    await route({ body: postalDto }, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'POSTAL_COMMIT_INCOMPLETE', outcome: { register: 'complete', cash: 'absent' }, error: expect.stringContaining('Ponów ten sam wpis') }));
    expect(next).not.toHaveBeenCalled(); spy.mockRestore();
});
