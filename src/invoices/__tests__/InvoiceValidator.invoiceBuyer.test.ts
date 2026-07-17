/**
 * F3 (follow-up) — PS ENVI "Nabywca/Odbiorca FV" plan.
 * Plan: 20_projects/Aplikacje/AQM.APP.01/plans/2026-07-16-psenvi-fv-nabywca-odbiorca-plan.md
 *
 * Coverage: SOFT (log-only, NO throw) consistency guard for the FV buyer —
 * InvoiceValidator.checkInvoiceBuyerConsistency().
 *
 * The guard fires ONLY when the contract carries a configured `_invoiceBuyer`
 * (end-to-end: fetched contract -> front `_contract` payload -> new ContractOur).
 * It must warn on a mismatch but must never throw, so FV issuance stays unblocked
 * during the transitional F5 rollout.
 *
 * Tested directly on the private method with minimal stubs (no DB / settlement
 * controller involvement) — purely the guard's decision logic.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import InvoiceValidator from '../InvoiceValidator';

// Minimal stub factory — only the fields the guard reads.
function makeValidator(
    contract: Partial<{
        id: number;
        ourId: string;
        _invoiceBuyer?: { id: number; name?: string } | undefined;
    }>,
    invoice: Partial<{ entityId?: number }>
) {
    return new InvoiceValidator(contract as any, invoice as any);
}

// The guard is private; invoke it directly for a targeted unit test.
function runGuard(validator: InvoiceValidator) {
    (validator as any).checkInvoiceBuyerConsistency();
}

describe('InvoiceValidator.checkInvoiceBuyerConsistency (SOFT FV buyer guard)', () => {
    let warnSpy: jest.SpiedFunction<typeof console.warn>;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('does NOT warn when the contract has no _invoiceBuyer configured', () => {
        const validator = makeValidator(
            { id: 500, ourId: 'ENVI.OUR.001', _invoiceBuyer: undefined },
            { entityId: 123 }
        );

        expect(() => runGuard(validator)).not.toThrow();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does NOT warn when entityId matches _invoiceBuyer.id', () => {
        const validator = makeValidator(
            { id: 871, ourId: 'ENVI.OUR.871', _invoiceBuyer: { id: 459, name: 'Gmina X' } },
            { entityId: 459 }
        );

        expect(() => runGuard(validator)).not.toThrow();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns (log-only, no throw) when entityId differs from _invoiceBuyer.id', () => {
        const validator = makeValidator(
            { id: 871, ourId: 'ENVI.OUR.871', _invoiceBuyer: { id: 459, name: 'Gmina X' } },
            { entityId: 999 }
        );

        expect(() => runGuard(validator)).not.toThrow();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const msg = String(warnSpy.mock.calls[0][0]);
        expect(msg).toContain('[FV Nabywca][SOFT]');
        expect(msg).toContain('ENVI.OUR.871');
        expect(msg).toContain('999'); // actual invoice buyer
        expect(msg).toContain('459'); // configured contract buyer
    });

    it('warns when the invoice has no entityId but the contract has a buyer', () => {
        const validator = makeValidator(
            { id: 871, ourId: 'ENVI.OUR.871', _invoiceBuyer: { id: 459 } },
            { entityId: undefined }
        );

        expect(() => runGuard(validator)).not.toThrow();
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});
