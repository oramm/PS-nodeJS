export class ChatSpaceError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'ChatSpaceError';
    }
}

export default class ChatSpaceValidator {
    static personIds(value: unknown): number[] {
        if (!Array.isArray(value) || value.length > 50 ||
            value.some(id => !Number.isSafeInteger(id) || id <= 0))
            throw new ChatSpaceError('Wybierz maksymalnie 50 osób z listy.', 400);
        return [...new Set<number>(value)];
    }
}
