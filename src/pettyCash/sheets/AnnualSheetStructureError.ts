export type AnnualSheetErrorCode = 'ANNUAL_SHEET_MISSING' | 'ANNUAL_SHEET_INCOMPLETE';

export default class AnnualSheetStructureError extends Error {
    readonly status = 409;

    constructor(
        readonly code: AnnualSheetErrorCode,
        readonly module: 'cash' | 'postal',
        readonly year: number,
        message: string
    ) {
        super(message);
        this.name = 'AnnualSheetStructureError';
    }
}
