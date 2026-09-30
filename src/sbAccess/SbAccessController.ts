import ToolsDb from '../tools/ToolsDb';
import SbAccessRepository from './SbAccessRepository';
import SbAccessEventRepository from './SbAccessEventRepository';
import {
    SB_ACCESS_ACTIONS,
    SB_ACCESS_RESULTS,
    SB_ACCESS_STATUSES,
    SbAccessTransitionInput,
} from './sbAccessTypes';

export default class SbAccessController {
    private static repository = new SbAccessRepository();
    private static events = new SbAccessEventRepository();

    static async recordTransition(
        input: SbAccessTransitionInput,
    ): Promise<void> {
        if (!Number.isInteger(input?.personId) || input.personId <= 0)
            throw new Error('Wymagany poprawny personId');
        if (!SB_ACCESS_ACTIONS.includes(input.actionCode))
            throw new Error('Nieznany kod czynności SB');
        if (!SB_ACCESS_RESULTS.includes(input.resultCode))
            throw new Error('Nieznany kod wyniku SB');
        if (input.state && !SB_ACCESS_STATUSES.includes(input.state.statusCode))
            throw new Error('Nieznany kod stanu SB');
        if (
            input.requestedByPersonId != null &&
            (!Number.isInteger(input.requestedByPersonId) ||
                input.requestedByPersonId <= 0)
        )
            throw new Error('Niepoprawny identyfikator zlecającego');

        await ToolsDb.transaction<void>(async (conn) => {
            if (input.state)
                await this.repository.upsertState(conn, {
                    ...input.state,
                    personId: input.personId,
                });
            await this.events.append(conn, {
                personId: input.personId,
                actionCode: input.actionCode,
                resultCode: input.resultCode,
                requestedByPersonId: input.requestedByPersonId,
                note: input.note,
            });
        });
    }

    static list() {
        return this.repository.list();
    }

    static getByPersonId(personId: number) {
        return this.repository.getByPersonId(personId);
    }

    static history(personId: number, limit?: number) {
        return this.events.listByPersonId(personId, limit);
    }
}
