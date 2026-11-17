export default class TaskValidator {
    static selectedCaseId(payload: { _case?: { id?: number } }, fields?: string[]) {
        return !fields || fields.includes('caseId') ? payload._case?.id : undefined;
    }

    static sharedParent(caseId: number | undefined, storedCaseId: number, fields?: string[]) {
        if ((!fields || fields.includes('caseId')) && caseId !== undefined && caseId !== storedCaseId)
            throw new Error('Przenoszenie wspólnego zadania wymaga osobnej operacji.');
    }
}
