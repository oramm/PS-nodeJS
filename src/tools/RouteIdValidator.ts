import { BadRequestError } from '../persons/projectAssignments/ProjectScopeGuard';

export default class RouteIdValidator {
    static positiveId(value: unknown): number {
        if (typeof value !== 'string' || !/^[0-9]+$/.test(value))
            throw new BadRequestError('Nieprawidłowy identyfikator w adresie.');
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id <= 0)
            throw new BadRequestError('Nieprawidłowy identyfikator w adresie.');
        return id;
    }
}
