import { BadRequestError } from '../persons/projectAssignments/ProjectScopeGuard';

export default class ProjectValidator {
    static normalizeFundingFields(dto: any): any {
        const normalized = { ...dto };
        for (const [field, label] of [
            ['fundingAgreementNumber', 'Numer umowy o dofinansowanie'],
            ['program', 'Program'],
        ]) {
            if (!Object.prototype.hasOwnProperty.call(dto, field)) continue;
            let value = dto[field];
            // shortcut: parseObjectsJSON zamienia tekst na number/boolean (np. „1.50” wraca jako „1.5”); dokładny zapis wymaga zmiany parsera wejścia.
            if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
            if (value !== null && typeof value !== 'string') {
                throw new BadRequestError(`${label} musi być tekstem lub null.`);
            }
            const trimmed = value?.trim() || null;
            if (trimmed && Array.from(trimmed).length > 50) {
                throw new BadRequestError(`${label} może mieć maksymalnie 50 znaków.`);
            }
            normalized[field] = trimmed;
        }
        return normalized;
    }
}
