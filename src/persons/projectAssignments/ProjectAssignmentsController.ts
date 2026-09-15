import ToolsDb from '../../tools/ToolsDb';
import PersonAccountEventsController from '../accountEvents/PersonAccountEventsController';
import ProjectAssignmentRepository, {
    AssignedProject,
} from './ProjectAssignmentRepository';
import { BadRequestError } from './ProjectScopeGuard';

/**
 * Przypisania projektów osoby (zakres ról CONTRACT_WORKER / CLIENT).
 *
 * DLACZEGO TEN KONTROLER POWSTAŁ W ROD-3. Do tej pory router wołał repozytorium wprost (wzorzec
 * zaszły, tolerowany). Zapis zdarzenia „zmieniono zakres projektów" musi iść w TEJ SAMEJ
 * transakcji co podmiana przypisań (decyzja techniczna planu ROD), a transakcjami zarządza
 * kontroler, nie router ani repozytorium - stąd cienki kontroler z jedną metodą use-case
 * (touch-and-migrate: fragment dotknięty, fragment zmigrowany do wzorca docelowego).
 */
export default class ProjectAssignmentsController {
    static async getAssignedProjects(
        personId: number,
    ): Promise<AssignedProject[]> {
        return await ProjectAssignmentRepository.getAssignedProjects(personId);
    }

    /**
     * Podmienia komplet przypisań (replace-all; pusta lista czyści) i zapisuje zdarzenie
     * konta z listą projektów przed i po - w jednej transakcji.
     * Nieistniejący projekt to błąd, a nie cicho pominięty wpis - inaczej literówka w OurId
     * zawęziłaby dostęp bez śladu (reguła przeniesiona z routera).
     */
    static async replaceAssignments(
        personId: number,
        projectOurIds: string[],
        actorPersonId?: number,
    ): Promise<AssignedProject[]> {
        const existing =
            await ProjectAssignmentRepository.filterExistingProjectOurIds(
                projectOurIds,
            );
        const unknown = projectOurIds.filter(
            (ourId) => !existing.includes(ourId),
        );
        if (unknown.length > 0)
            throw new BadRequestError(`Nieznane projekty: ${unknown.join(', ')}`);

        const before =
            await ProjectAssignmentRepository.getAssignedProjectOurIds(personId);

        await ToolsDb.transaction(async (conn) => {
            await ProjectAssignmentRepository.setAssignments(
                personId,
                projectOurIds,
                conn,
            );
            await PersonAccountEventsController.recordChanges(conn, {
                personId,
                editorId: actorPersonId ?? null,
                eventType: 'PROJECT_ASSIGNMENTS',
                changes: [
                    { field: 'projectOurIds', before, after: projectOurIds },
                ],
            });
        });

        return await ProjectAssignmentRepository.getAssignedProjects(personId);
    }
}
