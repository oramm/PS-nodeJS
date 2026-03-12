import { PaymentStatus } from './CostInvoice';

export const VALID_PAYMENT_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

/**
 * Walidator dla operacji na fakturach kosztowych
 */
export class CostInvoiceValidator {
    /**
     * Waliduje dane aktualizacji płatności.
     * Zwraca komunikat błędu lub null gdy dane są poprawne.
     * 
     * @param body Dane do walidacji
     * @param grossAmount Kwota brutto faktury (do sprawdzenia limitu)
     */
    static validatePaymentUpdate(body: Record<string, unknown>, grossAmount?: number): string | null {
        const { paymentStatus, paidAmount } = body;
        
        let parsedPaidAmount: number | undefined;

        // Walidacja typu i zakresu paymentStatus
        if (paymentStatus !== undefined) {
            if (!VALID_PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
                return `Nieprawidłowy status płatności: ${paymentStatus}`;
            }
        }

        // Walidacja typu i zakresu paidAmount
        if (paidAmount !== undefined) {
            const amount = Number(paidAmount);
            if (isNaN(amount) || !isFinite(amount)) {
                return 'Kwota płatności musi być liczbą';
            }
            if (amount < 0) {
                return 'Kwota płatności nie może być ujemna';
            }
            parsedPaidAmount = amount;
        }

        // Walidacja względem grossAmount
        if (parsedPaidAmount !== undefined && grossAmount !== undefined) {
            if (parsedPaidAmount > grossAmount) {
                return `Kwota płatności (${parsedPaidAmount}) nie może przekroczyć kwoty brutto faktury (${grossAmount})`;
            }
        }

        // Walidacja zależności między statusem a kwotą
        if (paymentStatus !== undefined && parsedPaidAmount !== undefined) {
            const status = paymentStatus as PaymentStatus;
            
            if (status === 'UNPAID' && parsedPaidAmount !== 0) {
                return 'Status UNPAID wymaga paidAmount = 0';
            }
            
            if (status === 'PAID' && grossAmount !== undefined && parsedPaidAmount !== grossAmount) {
                return `Status PAID wymaga paidAmount = grossAmount (${grossAmount})`;
            }
            
            if (status === 'PARTIALLY_PAID') {
                if (parsedPaidAmount === 0) {
                    return 'Status PARTIALLY_PAID wymaga paidAmount > 0';
                }
                if (grossAmount !== undefined && parsedPaidAmount >= grossAmount) {
                    return `Status PARTIALLY_PAID wymaga paidAmount < grossAmount (${grossAmount})`;
                }
            }
        }

        // Walidacja dedukowana ze statusu (gdy mamy tylko status bez paidAmount)
        if (paymentStatus !== undefined && paidAmount === undefined && grossAmount !== undefined) {
            const status = paymentStatus as PaymentStatus;
            
            if (status === 'UNPAID') {
                // OK - będziemy ustawiać paidAmount = 0 w kontrolerze
            }
            
            if (status === 'PAID') {
                // OK - będziemy ustawiać paidAmount = grossAmount w kontrolerze
            }
            
            if (status === 'PARTIALLY_PAID') {
                return 'Status PARTIALLY_PAID wymaga podania paidAmount';
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
