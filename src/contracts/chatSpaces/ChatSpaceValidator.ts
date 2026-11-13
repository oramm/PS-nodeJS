import { parseContractSelectedPersonIds } from '../contractAssignees';

export class ChatSpaceError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'ChatSpaceError';
    }
}

export default class ChatSpaceValidator {
    static personIds(value: unknown): number[] {
        try { return parseContractSelectedPersonIds(value); }
        catch { throw new ChatSpaceError('Wybierz maksymalnie 50 osób z listy.', 400); }
    }
}
