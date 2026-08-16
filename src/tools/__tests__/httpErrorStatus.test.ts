import { describe, expect, it } from '@jest/globals';
import { resolveHttpErrorStatus } from '../httpErrorStatus';
import EnviErrors from '../Errors';

describe('resolveHttpErrorStatus', () => {
    it('maps a SystemEmail conflict DbError to 409, not 500', () => {
        const err = new EnviErrors.DbError(
            "SystemEmail 'a@b.c' is already used by another person account.",
            'PERSON_ACCOUNT_SYSTEM_EMAIL_CONFLICT',
            409,
        );

        expect(resolveHttpErrorStatus(err)).toBe(409);
    });

    it('maps a foreign key DbError to 409', () => {
        const err = new EnviErrors.DbError(
            'Nie można usunąć oferty...',
            'FOREIGN_KEY_CONSTRAINT',
            409,
        );

        expect(resolveHttpErrorStatus(err)).toBe(409);
    });

    it('keeps 500 for a DbError without an explicit status', () => {
        const err = new EnviErrors.DbError('Awaria bazy', 'DB_ERROR');

        expect(resolveHttpErrorStatus(err)).toBe(500);
    });

    it('maps mysql ER_DUP_ENTRY and ER_ROW_IS_REFERENCED* to 409', () => {
        expect(resolveHttpErrorStatus({ code: 'ER_DUP_ENTRY' })).toBe(409);
        expect(resolveHttpErrorStatus({ code: 'ER_ROW_IS_REFERENCED' })).toBe(
            409,
        );
        expect(resolveHttpErrorStatus({ code: 'ER_ROW_IS_REFERENCED_2' })).toBe(
            409,
        );
    });

    it('honours an explicit 4xx status on any error', () => {
        expect(resolveHttpErrorStatus({ status: 403 })).toBe(403);
        expect(resolveHttpErrorStatus({ status: 400 })).toBe(400);
    });

    it('ignores a 5xx or malformed status and falls back to 500', () => {
        expect(resolveHttpErrorStatus({ status: 503 })).toBe(500);
        expect(resolveHttpErrorStatus({ status: '409' })).toBe(500);
        expect(resolveHttpErrorStatus(new Error('boom'))).toBe(500);
        expect(resolveHttpErrorStatus(undefined)).toBe(500);
    });
});
