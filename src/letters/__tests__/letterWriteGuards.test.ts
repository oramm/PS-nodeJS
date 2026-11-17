import {
    assertNewLetterInScope,
    assertTargetCasesInScope,
    pinEditorForPersonAgent,
    pinProjectFromDb,
} from '../letterWriteGuards';
import { ForbiddenError } from '../../persons/projectAssignments/ProjectScopeGuard';
import ToolsDb from '../../tools/ToolsDb';

jest.mock('../../tools/ToolsDb');

const mockedToolsDb = ToolsDb as jest.Mocked<typeof ToolsDb>;
const SCOPE = { projectOurIds: ['2023.10'] };
const PERSON = { enviId: 140, systemEmail: 'jan@envi.com.pl' } as any;

describe('pinEditorForPersonAgent', () => {
    it('agent pracownika: autorem jest osoba z sesji, nie _editor z ciała', () => {
        const params: any = { _editor: { id: 999 } };
        pinEditorForPersonAgent(params, { ...PERSON, isPersonAgent: true });
        expect(params._editor).toEqual({ id: 140 });
    });

    it('agent bez _editor w ciele też dostaje autora z sesji', () => {
        const params: any = {};
        pinEditorForPersonAgent(params, { ...PERSON, isPersonAgent: true });
        expect(params._editor).toEqual({ id: 140 });
    });

    it('człowiek w przeglądarce wybiera autora sam', () => {
        const params: any = { _editor: { id: 999 } };
        pinEditorForPersonAgent(params, PERSON);
        expect(params._editor).toEqual({ id: 999 });
    });
});

describe('assertTargetCasesInScope', () => {
    beforeEach(() => jest.resetAllMocks());

    it('rola bez ograniczeń: nie pyta bazy', async () => {
        await assertTargetCasesInScope([{ id: 1 }], undefined);
        expect(mockedToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('edycja bez _cases: nic do sprawdzenia', async () => {
        await assertTargetCasesInScope(undefined, SCOPE);
        expect(mockedToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('przepuszcza, gdy wszystkie sprawy docelowe są w zakresie', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { ProjectOurId: '2023.10' },
        ] as any);
        await expect(
            assertTargetCasesInScope([{ id: 1 }, { id: 2 }], SCOPE),
        ).resolves.toBeUndefined();
        expect(mockedToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(2);
    });

    it('odmawia przepięcia pisma, gdy choć jedna sprawa jest z cudzego projektu', async () => {
        mockedToolsDb.getQueryCallbackAsync
            .mockResolvedValueOnce([{ ProjectOurId: '2023.10' }] as any)
            .mockResolvedValueOnce([{ ProjectOurId: '2099.99' }] as any);
        await expect(
            assertTargetCasesInScope([{ id: 1 }, { id: 2 }], SCOPE),
        ).rejects.toThrow(ForbiddenError);
    });

    it('odmawia, gdy _cases nie jest listą albo sprawa nie ma id', async () => {
        await expect(assertTargetCasesInScope('1', SCOPE)).rejects.toThrow(
            ForbiddenError,
        );
        await expect(assertTargetCasesInScope([{}], SCOPE)).rejects.toThrow(
            ForbiddenError,
        );
    });
});

describe('assertNewLetterInScope (POST /letterReact)', () => {
    beforeEach(() => jest.resetAllMocks());
    const inScope = [{ ProjectOurId: '2023.10' }] as any;
    const foreign = [{ ProjectOurId: '2099.99' }] as any;

    it('rola bez ograniczeń: nie pyta bazy', async () => {
        await assertNewLetterInScope({ _cases: [{ id: 1 }] }, undefined);
        expect(mockedToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('przepuszcza, gdy kontrakt i wszystkie sprawy są w zakresie', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue(inScope);
        await expect(
            assertNewLetterInScope(
                { _contract: { id: 5 }, _cases: [{ id: 1 }, { id: 2 }] },
                SCOPE,
            ),
        ).resolves.toBeUndefined();
        expect(mockedToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(3);
    });

    it('odmawia, gdy druga sprawa jest z cudzego projektu (kontrakt swój)', async () => {
        mockedToolsDb.getQueryCallbackAsync
            .mockResolvedValueOnce(inScope)
            .mockResolvedValueOnce(inScope)
            .mockResolvedValueOnce(foreign);
        await expect(
            assertNewLetterInScope(
                { _contract: { id: 5 }, _cases: [{ id: 1 }, { id: 2 }] },
                SCOPE,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('odmawia, gdy kontrakt z ciała jest cudzy, choć sprawy są swoje', async () => {
        mockedToolsDb.getQueryCallbackAsync
            .mockResolvedValueOnce(foreign)
            .mockResolvedValue(inScope);
        await expect(
            assertNewLetterInScope(
                { _contract: { id: 5 }, _cases: [{ id: 1 }] },
                SCOPE,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('bez kontraktu sprawdza każdą sprawę', async () => {
        mockedToolsDb.getQueryCallbackAsync
            .mockResolvedValueOnce(inScope)
            .mockResolvedValueOnce(foreign);
        await expect(
            assertNewLetterInScope({ _cases: [{ id: 1 }, { id: 2 }] }, SCOPE),
        ).rejects.toThrow(ForbiddenError);
    });

    it('odmawia bez kontraktu i bez spraw', async () => {
        await expect(assertNewLetterInScope({}, SCOPE)).rejects.toThrow(
            ForbiddenError,
        );
        await expect(
            assertNewLetterInScope({ _cases: [] }, SCOPE),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('pinProjectFromDb', () => {
    beforeEach(() => jest.resetAllMocks());
    const DB_ROW = [{ OurId: '2023.10', LettersGdFolderId: 'folder-z-bazy' }] as any;

    it('brak _project albo id projektu: nic do sprawdzenia', async () => {
        await pinProjectFromDb(undefined, SCOPE);
        await pinProjectFromDb(null, SCOPE);
        await pinProjectFromDb({ lettersGdFolderId: 'x' }, SCOPE);
        expect(mockedToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('folder i numer projektu z bazy, nie z ciała (także bez zakresu)', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue(DB_ROW);
        const project: any = { id: 7, ourId: '2099.99', lettersGdFolderId: 'obcy-folder' };
        await pinProjectFromDb(project, undefined);
        expect(project).toEqual({ id: 7, ourId: '2023.10', lettersGdFolderId: 'folder-z-bazy' });
    });

    it('rola zakresowa: projekt w zakresie przechodzi', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue(DB_ROW);
        await expect(pinProjectFromDb({ id: 7 }, SCOPE)).resolves.toBeUndefined();
    });

    it('rola zakresowa: cudzy projekt = odmowa', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([
            { OurId: '2099.99', LettersGdFolderId: 'x' },
        ] as any);
        await expect(pinProjectFromDb({ id: 8 }, SCOPE)).rejects.toThrow(ForbiddenError);
    });

    it('nieistniejący albo nieprawidłowy projekt = odmowa', async () => {
        mockedToolsDb.getQueryCallbackAsync.mockResolvedValue([] as any);
        await expect(pinProjectFromDb({ id: 9 }, undefined)).rejects.toThrow(ForbiddenError);
        await expect(pinProjectFromDb({ id: 'abc' }, undefined)).rejects.toThrow(ForbiddenError);
    });
});
