jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/ToolsGd', () => ({ __esModule: true, default: {} }));

import ToolsDb from '../../tools/ToolsDb';
import InvoiceRepository from '../InvoiceRepository';
import InvoiceItemRepository from '../InvoiceItemRepository';
import { personContractScope } from '../../persons/projectAssignments/projectMembership';

const db = ToolsDb.getQueryCallbackAsync as jest.Mock;
const sql = () => String(db.mock.calls[0][0]);
beforeEach(() => db.mockResolvedValue([]));

it.each([new InvoiceRepository(), new InvoiceItemRepository()])('repozytorium %p: rola kontraktowa daje tylko wskazany kontrakt, poza grupami OR', async (repository) => {
    const scope = personContractScope([{ personId: 7, contractId: 11, projectOurId: 'A' }], 7);
    await repository.find([{ contractId: 99 }, {}], scope);
    expect(sql()).toMatch(/WHERE \([\s\S]+\) AND \(0 OR Contracts.Id IN \(11\)\)/);
    expect(sql()).not.toContain("Contracts.ProjectOurId IN ('A')");
});
it.each([new InvoiceRepository(), new InvoiceItemRepository()])('repozytorium %p: projekt obejmuje wszystkie jego kontrakty', async (repository) => {
    const scope = personContractScope([{ personId: 7, contractId: null, projectOurId: 'A' }], 7);
    await repository.find([], scope);
    expect(sql()).toContain("WHERE (1) AND (Contracts.ProjectOurId IN ('A') OR 0)");
});
it.each([new InvoiceRepository(), new InvoiceItemRepository()])('repozytorium %p: bez członkostwa nie ma faktur ani pozycji', async (repository) => {
    await repository.find([], personContractScope([], 7));
    expect(sql()).toContain('WHERE (1) AND (0 OR 0)');
});
it.each([new InvoiceRepository(), new InvoiceItemRepository()])('repozytorium %p: brak zakresu zachowuje pełny odczyt', async (repository) => {
    await repository.find([]);
    expect(sql()).toContain('WHERE (1) AND 1');
});
it('korekty dołączane do listy też podlegają zakresowi kontraktów', async () => {
    await new InvoiceRepository().findCorrectionsBulk([10], { projectOurIds: [], contractIds: [11] });
    expect(sql()).toContain('Invoices.CorrectedInvoiceId IN (10)');
    expect(sql()).toContain('Invoices.ContractId IN (SELECT Contracts.Id FROM Contracts WHERE (0 OR Contracts.Id IN (11)))');
});
