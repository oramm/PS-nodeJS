export default class ProjectValidator {
    static normalizeFundingFields(dto: any): any {
        const normalized = { ...dto };
        for (const [field, label] of [
            ['fundingAgreementNumber', 'Numer umowy o dofinansowanie'],
            ['program', 'Program'],
        ]) {
            if (!Object.prototype.hasOwnProperty.call(dto, field)) continue;
            const value = dto[field];
            if (value !== null && typeof value !== 'string') {
                throw new Error(`${label} musi być tekstem lub null.`);
            }
            const trimmed = value?.trim() || null;
            if (trimmed && Array.from(trimmed).length > 50) {
                throw new Error(`${label} może mieć maksymalnie 50 znaków.`);
            }
            normalized[field] = trimmed;
        }
        return normalized;
    }
}
