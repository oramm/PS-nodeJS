import ToolsDb from '../../tools/ToolsDb';
import { ProjectScope } from '../../types/sessionTypes';

/** Odmowa dostępu do konkretnego rekordu - mapowana na 403 w globalnym error handlerze. */
export class ForbiddenError extends Error {
    readonly status = 403;

    constructor(message = 'Brak uprawnień do tego zasobu.') {
        super(message);
        this.name = 'ForbiddenError';
    }
}

/** Błędne dane wejściowe - mapowane na 400, bez raportu awarii do zespołu. */
export class BadRequestError extends Error {
    readonly status = 400;

    constructor(message: string) {
        super(message);
        this.name = 'BadRequestError';
    }
}

/**
 * Sprawdza, czy rekord, na którym operuje zapis, należy do przypisanego projektu.
 *
 * PO CO. Filtr zakresu w repozytoriach zawęża tylko odczyty. Bez tego pracownik
 * kontraktowy mógłby wykonać PUT /case/123 na sprawie z cudzego projektu - id sprawy
 * jest przewidywalne, a trasa jest na allowliście.
 *
 * ZASADA. Zawsze pytamy bazę o id z URL-a, nigdy nie ufamy rodzicowi z ciała żądania:
 * ciało kontroluje wywołujący i mógłby podać w nim projekt, do którego ma dostęp.
 */
export default class ProjectScopeGuard {
    /** Zapytania rozwiązujące rekord do OurId projektu jego kontraktu. */
    private static readonly PROJECT_OUR_ID_SQL = {
        contract: `SELECT ProjectOurId FROM Contracts WHERE Id = ?`,
        milestone: `SELECT c.ProjectOurId
            FROM Milestones m JOIN Contracts c ON c.Id = m.ContractId
            WHERE m.Id = ?`,
        case: `SELECT c.ProjectOurId
            FROM Cases ca
            JOIN Milestones m ON m.Id = ca.MilestoneId
            JOIN Contracts c ON c.Id = m.ContractId
            WHERE ca.Id = ?`,
        task: `SELECT c.ProjectOurId
            FROM Tasks t
            JOIN Cases ca ON ca.Id = t.CaseId
            JOIN Milestones m ON m.Id = ca.MilestoneId
            JOIN Contracts c ON c.Id = m.ContractId
            WHERE t.Id = ?`,
        meeting: `SELECT c.ProjectOurId
            FROM Meetings mt JOIN Contracts c ON c.Id = mt.ContractId
            WHERE mt.Id = ?`,
        contractMeetingNote: `SELECT c.ProjectOurId
            FROM ContractMeetingNotes n JOIN Contracts c ON c.Id = n.ContractId
            WHERE n.Id = ?`,
        meetingArrangement: `SELECT c.ProjectOurId
            FROM MeetingArrangements ma
            JOIN Cases ca ON ca.Id = ma.CaseId
            JOIN Milestones m ON m.Id = ca.MilestoneId
            JOIN Contracts c ON c.Id = m.ContractId
            WHERE ma.Id = ?`,
        // Pismo wisi na kontrakcie przez sprawy (Letters_Cases). Pismo bez powiązanej
        // sprawy nie rozwiąże się do żadnego projektu i zostanie odrzucone - świadomie,
        // bo nie ma jak stwierdzić, czy należy do przypisanego zakresu.
        letter: `SELECT DISTINCT c.ProjectOurId
            FROM Letters l
            JOIN Letters_Cases lc ON lc.LetterId = l.Id
            JOIN Cases ca ON ca.Id = lc.CaseId
            JOIN Milestones m ON m.Id = ca.MilestoneId
            JOIN Contracts c ON c.Id = m.ContractId
            WHERE l.Id = ?`,
    } as const;

    private static async assertInScope(
        sqlKey: keyof typeof ProjectScopeGuard.PROJECT_OUR_ID_SQL,
        id: number | undefined,
        scope: ProjectScope | undefined,
        label: string
    ): Promise<void> {
        if (!scope) return; // role bez ograniczeń
        if (!Number.isInteger(id) || (id as number) <= 0)
            throw new ForbiddenError(`Nieprawidłowy identyfikator: ${label}.`);

        const rows = (await ToolsDb.getQueryCallbackAsync(
            ProjectScopeGuard.PROJECT_OUR_ID_SQL[sqlKey],
            undefined,
            [id]
        )) as any[];

        const projectOurIds = rows
            .map((r) => r.ProjectOurId)
            .filter((ourId): ourId is string => Boolean(ourId));

        // Brak wiersza traktujemy tak samo jak brak uprawnień: nie zdradzamy, czy rekord
        // istnieje. Przy piśmie w kilku sprawach wystarczy jeden projekt w zakresie.
        const isInScope = projectOurIds.some((ourId) =>
            scope.projectOurIds.includes(ourId)
        );
        if (!isInScope)
            throw new ForbiddenError(
                `Brak uprawnień do tego zasobu (${label}).`
            );
    }

    static assertContractInScope(id: number | undefined, scope?: ProjectScope) {
        return this.assertInScope('contract', id, scope, 'kontrakt');
    }

    static assertMilestoneInScope(
        id: number | undefined,
        scope?: ProjectScope
    ) {
        return this.assertInScope('milestone', id, scope, 'kamień milowy');
    }

    static assertCaseInScope(id: number | undefined, scope?: ProjectScope) {
        return this.assertInScope('case', id, scope, 'sprawa');
    }

    static assertTaskInScope(id: number | undefined, scope?: ProjectScope) {
        return this.assertInScope('task', id, scope, 'zadanie');
    }

    static assertLetterInScope(id: number | undefined, scope?: ProjectScope) {
        return this.assertInScope('letter', id, scope, 'pismo');
    }

    static assertMeetingInScope(id: number | undefined, scope?: ProjectScope) {
        return this.assertInScope('meeting', id, scope, 'spotkanie');
    }

    static assertContractMeetingNoteInScope(
        id: number | undefined,
        scope?: ProjectScope
    ) {
        return this.assertInScope(
            'contractMeetingNote',
            id,
            scope,
            'notatka ze spotkania'
        );
    }

    static assertMeetingArrangementInScope(
        id: number | undefined,
        scope?: ProjectScope
    ) {
        return this.assertInScope(
            'meetingArrangement',
            id,
            scope,
            'ustalenie ze spotkania'
        );
    }
}
