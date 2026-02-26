import { PaymentStatus } from './CostInvoice';

const VALID_PAYMENT_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

/**
 * Walidator dla operacji na fakturach kosztowych
 */
export class CostInvoiceValidator {
    /**
     * Waliduje dane aktualizacji płatności.
     * Zwraca komunikat błędu lub null gdy dane są poprawne.
     */
    static validatePaymentUpdate(body: Record<string, unknown>): string | null {
        const { paymentStatus, paidAmount } = body;

        if (paymentStatus !== undefined) {
            if (!VALID_PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
                return `Nieprawidłowy status płatności: ${paymentStatus}`;
            }
        }

        if (paidAmount !== undefined) {
            const amount = Number(paidAmount);
            if (isNaN(amount) || !isFinite(amount) || amount < 0) {
                return 'Kwota płatności musi być liczbą nieujemną';
            }
        }

        return null;
    }
}

/**
 * Konwertuje wartość z DB na PaymentStatus z zabezpieczeniem przed nieoczekiwanymi wartościami
 */
export function toPaymentStatus(val: unknown): PaymentStatus {
    if (VALID_PAYMENT_STATUSES.includes(val as PaymentStatus)) {
        return val as PaymentStatus;
    }
    return 'UNPAID';
}
