import ToolsDb from '../../tools/ToolsDb';
import SiteVisitRepository from '../SiteVisitRepository';

jest.mock('../../tools/ToolsDb');

const mockedToolsDb = ToolsDb as jest.Mocked<typeof ToolsDb>;

/** Zwraca SQL głównego zapytania (pierwsze wywołanie sterownika). */
function capturedSql(): string {
    return String(mockedToolsDb.getQueryCallbackAsync.mock.calls[0][0]);
}

/**
 * Przegląd wizyt jest jedynym miejscem, w którym rola zakresowa (klient) czyta rekordy
 * założone przez inne osoby. Router przepuszcza tam wyłącznie klienta i rolę 1/2, więc
 * cały ciężar rozdzielenia "czyje wizyty" spoczywa na tym warunku SQL.
 */
describe('wymuszony zakres projektów w zapytaniach o wizyty', () => {
    const repository = new SiteVisitRepository();

    beforeEach(() => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([] as any);
    });

    describe('find', () => {
        it('bez zakresu zapytanie zostaje bez zmian - role nieograniczone widzą wszystko', async () => {
            await repository.find({ dateFrom: '2026-01-01' });

            expect(capturedSql()).not.toContain('ProjectOurId IN');
        });

        it('z zakresem filtruje po projektach kontraktu wizyty', async () => {
            await repository.find({ scope: { projectOurIds: ['2023.10'] } });

            expect(capturedSql()).toContain(
                "c.ProjectOurId IN ('2023.10')"
            );
        });

        it('pusty zakres nie zwraca niczego (fail-closed)', async () => {
            await repository.find({ scope: { projectOurIds: [] } });

            const sql = capturedSql();
            expect(sql).toContain('WHERE');
            expect(sql).toContain('0');
            expect(sql).not.toContain('ProjectOurId IN');
        });

        it('filtry z query stringa nie wypierają zakresu - warunki łączy AND', async () => {
            // personId i contractId przychodzą z URL-a przeglądu (drill-down), więc
            // muszą się dokładać do zakresu, a nie go zastępować.
            await repository.find({
                personId: 42,
                contractId: 7,
                scope: { projectOurIds: ['2023.10'] },
            });

            const sql = capturedSql();
            expect(sql).toContain('sv.PersonId = ?');
            expect(sql).toContain('sv.ContractId = ?');
            expect(sql).toContain("AND c.ProjectOurId IN ('2023.10')");
        });
    });

    describe('getVisitsSummary', () => {
        it('podsumowanie wg osób też jest zawężone - inaczej klient policzyłby cudze wizyty', async () => {
            await repository.getVisitsSummary('person', {
                scope: { projectOurIds: ['2023.10'] },
            });

            expect(capturedSql()).toContain("c.ProjectOurId IN ('2023.10')");
        });

        it('podsumowanie wg kontraktów też jest zawężone', async () => {
            await repository.getVisitsSummary('contract', {
                scope: { projectOurIds: ['2023.10'] },
            });

            expect(capturedSql()).toContain("c.ProjectOurId IN ('2023.10')");
        });
    });

    describe('findVisitByPhotoFileId', () => {
        it('zdjęcie z wizyty spoza zakresu nie istnieje dla roli zakresowej', async () => {
            await repository.findVisitByPhotoFileId('gd-file-1', {
                projectOurIds: ['2023.10'],
            });

            expect(capturedSql()).toContain("c.ProjectOurId IN ('2023.10')");
        });

        it('bez zakresu warunek jest neutralny', async () => {
            await repository.findVisitByPhotoFileId('gd-file-1');

            const sql = capturedSql();
            expect(sql).not.toContain('ProjectOurId IN');
            expect(sql).toContain('AND 1');
        });
    });
});
