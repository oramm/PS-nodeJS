import type { Request } from 'express';
import type { DataTool } from '@envi/agent-server/pomoc';
import ContractsController from '../contracts/ContractsController';
import { PROJECT_SCOPED_ROLES } from '../setup/Sessions/projectScopedPolicy';

export function pomocDataTools(req: Request): DataTool[] {
    const user = req.session.userData;
    if (!user) throw new Error('Brak aktywnej sesji.');
    return [
        {
            name: 'moja_sesja',
            description: 'Moja rola i zakres projektów w PS ENVI, jak na trasie /session. Bez tokenów i danych innych osób.',
            input_schema: { type: 'object', properties: {}, additionalProperties: false },
            async run() {
                return { rola: user.systemRoleName, projekty: req.projectScope?.projectOurIds ?? 'bez ograniczenia do przypisanych projektów' };
            },
        },
        {
            name: 'widoczny_kontrakt',
            description: 'Podstawowe dane kontraktu o podanym ID, który użytkownik widzi na liście kontraktów.',
            input_schema: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } }, required: ['id'], additionalProperties: false },
            async run(input) {
                const id = (input as { id?: unknown } | null)?.id;
                if (!Number.isSafeInteger(id) || (id as number) < 1) throw new Error('Podaj poprawne ID kontraktu.');
                // Brak wyliczonego zakresu nigdy nie może otworzyć wszystkich projektów.
                if (PROJECT_SCOPED_ROLES.includes(user.systemRoleName) && !req.projectScope)
                    throw new Error('Nie ustalono zakresu projektów.');
                const contracts = await ContractsController.find([{ id: id as number, typesToInclude: 'all' }], req.projectScope);
                return contracts.map(({ id, name, alias, startDate, endDate }) => ({ id, name, alias, startDate, endDate }));
            },
        },
    ];
}
