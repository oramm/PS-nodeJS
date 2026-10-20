import {
    assertTargetCasesInScope,
    pinEditorForPersonAgent,
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
