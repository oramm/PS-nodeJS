import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ToolsDb from '../../../tools/ToolsDb';
import ContractTemplatesTreeRepository from '../ContractTemplatesTreeRepository';

jest.mock('../../../tools/ToolsDb');

describe('ContractTemplatesTreeRepository - kształt zapytań', () => {
    let sql: string;
    const repository = new ContractTemplatesTreeRepository();

    beforeEach(() => {
        jest.clearAllMocks();
        sql = '';
        (ToolsDb.getQueryCallbackAsync as any).mockImplementation(
            async (query: string) => {
                sql = query;
                return [];
            }
        );
    });

    describe('findMilestoneTypes()', () => {
        it('używa LEFT JOIN na szablonach - typ bez szablonu musi zostać w wyniku', async () => {
            await repository.findMilestoneTypes(7);

            expect(sql).toMatch(/LEFT JOIN\s+MilestoneTemplates/);
            // JOIN bez LEFT wyciąłby 4 typy kamieni oznaczone jako domyślne
            expect(sql).not.toMatch(/\n\s+JOIN MilestoneTemplates/);
        });

        it('bierze tylko szablony CONTRACT i jeden wiersz na typ', async () => {
            await repository.findMilestoneTypes(7);

            expect(sql).toContain("MilestoneTemplates.TemplateType = 'CONTRACT'");
            expect(sql).toContain('GROUP BY MilestoneTypes.Id');
        });

        it('parametryzuje typ umowy', async () => {
            await repository.findMilestoneTypes(7);
            expect(sql).toContain(
                'MilestoneTypes_ContractTypes.ContractTypeId = 7'
            );
        });
    });

    describe('findCaseTypes()', () => {
        it('pomija typy istniejące wyłącznie jako podsprawy', async () => {
            await repository.findCaseTypes([1, 5]);
            expect(sql).toContain('CaseTypes.IsSubCaseOnly = FALSE');
        });

        it('używa LEFT JOIN na szablonach i jednego wiersza na typ', async () => {
            await repository.findCaseTypes([1, 5]);

            expect(sql).toMatch(/LEFT JOIN CaseTemplates/);
            expect(sql).toContain('GROUP BY CaseTypes.Id');
        });

        it('pusta lista typów kamieni nie odpytuje bazy', async () => {
            const rows = await repository.findCaseTypes([]);

            expect(rows).toEqual([]);
            expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
        });
    });
});
