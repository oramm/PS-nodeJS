import ProjectScopeGuard, { ForbiddenError } from '../ProjectScopeGuard';
import ToolsDb from '../../../tools/ToolsDb';

jest.mock('../../../tools/ToolsDb');

const mockedToolsDb = ToolsDb as jest.Mocked<typeof ToolsDb>;
const SCOPE = { projectOurIds: ['2023.10'] };

describe('ProjectScopeGuard', () => {
    it('przepuszcza rekord z przypisanego projektu', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { ProjectOurId: '2023.10' },
        ] as any);

        await expect(
            ProjectScopeGuard.assertCaseInScope(12, SCOPE)
        ).resolves.toBeUndefined();
    });

    it('odrzuca rekord z cudzego projektu - to jest ochrona przed IDOR', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { ProjectOurId: '2099.99' },
        ] as any);

        await expect(
            ProjectScopeGuard.assertCaseInScope(12, SCOPE)
        ).rejects.toThrow(ForbiddenError);
    });

    it('odrzuca rekord nieistniejący tak samo jak cudzy - bez zdradzania, który to przypadek', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([] as any);

        await expect(
            ProjectScopeGuard.assertCaseInScope(999999, SCOPE)
        ).rejects.toThrow(ForbiddenError);
    });

    it('odrzuca niepoprawny identyfikator, zanim zapyta bazę', async () => {
        await expect(
            ProjectScopeGuard.assertCaseInScope(NaN, SCOPE)
        ).rejects.toThrow(ForbiddenError);
        await expect(
            ProjectScopeGuard.assertCaseInScope(undefined, SCOPE)
        ).rejects.toThrow(ForbiddenError);

        expect(mockedToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('bez zakresu nie robi nic i nie odpytuje bazy - pozostałe role bez zmian', async () => {
        await expect(
            ProjectScopeGuard.assertCaseInScope(12, undefined)
        ).resolves.toBeUndefined();

        expect(mockedToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('pusty zakres odrzuca wszystko - konto bez przypisań nic nie ruszy', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { ProjectOurId: '2023.10' },
        ] as any);

        await expect(
            ProjectScopeGuard.assertCaseInScope(12, { projectOurIds: [] })
        ).rejects.toThrow(ForbiddenError);
    });

    it('pismo w kilku sprawach przechodzi, gdy choć jedna jest w zakresie', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { ProjectOurId: '2099.99' },
            { ProjectOurId: '2023.10' },
        ] as any);

        await expect(
            ProjectScopeGuard.assertLetterInScope(500, SCOPE)
        ).resolves.toBeUndefined();
    });

    it('pyta bazę o identyfikator z argumentu, a nie o cokolwiek innego', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { ProjectOurId: '2023.10' },
        ] as any);

        await ProjectScopeGuard.assertTaskInScope(77, SCOPE);

        const [, , params] = mockedToolsDb.getQueryCallbackAsync.mock.calls[0];
        expect(params).toEqual([77]);
    });

    it('ForbiddenError niesie status 403 - globalny handler mapuje go na odmowę, nie awarię', () => {
        expect(new ForbiddenError().status).toBe(403);
    });

    describe('każdy typ rekordu ma własne zapytanie rozwiązujące projekt', () => {
        const CASES: [string, () => Promise<void>][] = [
            ['kontrakt', () => ProjectScopeGuard.assertContractInScope(1, SCOPE)],
            ['kamień milowy', () => ProjectScopeGuard.assertMilestoneInScope(1, SCOPE)],
            ['sprawa', () => ProjectScopeGuard.assertCaseInScope(1, SCOPE)],
            ['zadanie', () => ProjectScopeGuard.assertTaskInScope(1, SCOPE)],
            ['pismo', () => ProjectScopeGuard.assertLetterInScope(1, SCOPE)],
            ['spotkanie', () => ProjectScopeGuard.assertMeetingInScope(1, SCOPE)],
            [
                'notatka ze spotkania',
                () => ProjectScopeGuard.assertContractMeetingNoteInScope(1, SCOPE),
            ],
            [
                'ustalenie ze spotkania',
                () => ProjectScopeGuard.assertMeetingArrangementInScope(1, SCOPE),
            ],
        ];

        it.each(CASES)('%s odrzuca rekord spoza zakresu', async (_label, assert) => {
            mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
                { ProjectOurId: '2099.99' },
            ] as any);

            await expect(assert()).rejects.toThrow(ForbiddenError);
        });
    });
});
