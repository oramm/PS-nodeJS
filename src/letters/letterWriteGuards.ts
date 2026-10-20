import ProjectScopeGuard from '../persons/projectAssignments/ProjectScopeGuard';
import { ProjectScope, UserData } from '../types/sessionTypes';

/**
 * SBZ-3 — agent pracownika zapisuje jako ta osoba, więc autorem pisma jest osoba z sesji,
 * nie `_editor` z ciała żądania. Bez tego agent mógł wpisać do rejestru dowolnego autora:
 * BusinessObject bierze `editorId` z `_editor` przysłanego przez klienta.
 * Ludzi w przeglądarce nie dotyczy — tam autora świadomie wybiera użytkownik.
 */
export function pinEditorForPersonAgent(
    params: { _editor?: unknown },
    userData: UserData,
): void {
    if (userData.isPersonAgent) params._editor = { id: userData.enviId };
}

/**
 * SBZ-3 — przy edycji pisma zakres sprawdzamy także dla spraw DOCELOWYCH z `_cases`,
 * nie tylko dla pisma w stanie sprzed edycji. Inaczej rola zakresowa przepinała pismo
 * ze swojego projektu do sprawy w cudzym (PUT /letter/:id z `_cases` cudzego projektu).
 * Każda sprawa musi być w zakresie — jedna cudza wystarcza do odmowy.
 */
export async function assertTargetCasesInScope(
    cases: unknown,
    scope?: ProjectScope,
): Promise<void> {
    if (!scope || cases === undefined) return;
    if (!Array.isArray(cases))
        return ProjectScopeGuard.assertCaseInScope(undefined, scope);
    for (const item of cases)
        await ProjectScopeGuard.assertCaseInScope(Number(item?.id), scope);
}
