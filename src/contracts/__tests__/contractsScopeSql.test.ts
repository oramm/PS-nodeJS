import ToolsDb from '../../tools/ToolsDb';
import ContractsWithChildrenRepository from '../ContractsWithChildrenRepository';
import CaseRepository from '../milestones/cases/CaseRepository';

jest.mock('../../tools/ToolsDb');
jest.mock('../ContractEntityAssociationsHelper', () => ({
    __esModule: true,
    default: { getContractEntityAssociationsList: jest.fn(async () => []) },
}));

const mockedToolsDb = ToolsDb as jest.Mocked<typeof ToolsDb>;

/** Zwraca SQL głównego zapytania (pierwsze wywołanie sterownika). */
function capturedSql(): string {
    return String(mockedToolsDb.getQueryCallbackAsync.mock.calls[0][0]);
}

describe('wymuszony zakres projektów w zapytaniach kontraktowych', () => {
    beforeEach(() => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([] as any);
    });

    describe('ContractsWithChildrenRepository', () => {
        const repository = new ContractsWithChildrenRepository();

        it('bez warunków i bez zakresu zwraca wszystko - zachowanie ról nieograniczonych', async () => {
            await repository.find([]);

            expect(capturedSql()).toContain('WHERE (1) AND 1');
        });

        it('bez warunków, ale z zakresem, filtruje po przypisanych projektach', async () => {
            // To jest najszerzej otwarta ścieżka odczytu w systemie: puste orConditions
            // oznaczają tu "całe drzewo kontraktów".
            await repository.find([], { projectOurIds: ['2023.10'] });

            expect(capturedSql()).toContain(
                "AND Contracts.ProjectOurId IN ('2023.10')"
            );
        });

        it('pusty zakres nie zwraca niczego', async () => {
            await repository.find([], { projectOurIds: [] });

            expect(capturedSql()).toContain('AND 0');
        });

        it('wrogie orConditions nie omijają zakresu - filtr jest PO ZEWNĘTRZNEJ stronie grup OR', async () => {
            // Klient kontroluje orConditions. Gdyby zakres był jednym z warunków wewnątrz
            // grupy, druga grupa OR wskazująca cudzy projekt obeszłaby go w całości.
            await repository.find(
                [
                    { _project: { ourId: '2023.10' } } as any,
                    { _project: { ourId: '2099.99' } } as any,
                ],
                { projectOurIds: ['2023.10'] }
            );

            const sql = capturedSql();
            const whereClause = sql.slice(sql.indexOf('WHERE'));

            // Zakres doklejony przez AND na końcu, poza nawiasem grup OR.
            expect(whereClause).toMatch(
                /AND Contracts\.ProjectOurId IN \('2023\.10'\)/
            );
            // Cudzy projekt może wystąpić w grupach OR, ale AND na zewnątrz i tak go odetnie.
            const scopeIndex = whereClause.indexOf(
                "AND Contracts.ProjectOurId IN ('2023.10')"
            );
            expect(whereClause.indexOf('2099.99')).toBeLessThan(scopeIndex);
        });
    });

    describe('CaseRepository', () => {
        const repository = new CaseRepository();

        it('dokleja zakres do zapytania o sprawy', async () => {
            await repository.find([{ contractId: 5 } as any], {
                projectOurIds: ['2023.10'],
            });

            expect(capturedSql()).toContain(
                "AND Contracts.ProjectOurId IN ('2023.10')"
            );
        });

        it('bez zakresu zapytanie zostaje bez zmian', async () => {
            await repository.find([{ contractId: 5 } as any]);

            expect(capturedSql()).not.toContain('ProjectOurId IN');
        });
    });
});
