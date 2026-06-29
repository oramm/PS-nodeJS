import ContractOur from '../contracts/ContractOur';

export type InvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE';
export const VALID_INVOICE_PAYMENT_STATUSES: InvoicePaymentStatus[] = [
    'UNPAID',
    'PARTIALLY_PAID',
    'PAID',
    'NOT_APPLICABLE',
];
import ContractsSettlementController, {
    ContractSettlementData,
} from '../contracts/ContractsSettlementController';
import Setup from '../setup/Setup';
import Tools from '../tools/Tools';
import Invoice from './Invoice';

export default class InvoiceValidator {
    private contract: ContractOur;
    private invoice: Invoice;

    constructor(contract: ContractOur, invoice: Invoice) {
        this.contract = contract;
        this.invoice = invoice;
    }

    async checkValueWithContract(isNewInvoice: boolean): Promise<boolean> {
        this.checkContractValueSet();

        const contractSettlementData = await this.getContractSettlementData();
        if (isNewInvoice) {
            this.checkNewInvoiceValue(contractSettlementData);
        } else {
            this.checkExistingInvoiceValue(contractSettlementData);
        }

        return true;
    }

    private checkContractValueSet() {
        if (!this.contract.value) {
            throw new Error('Wartość kontraktu nie została ustawiona');
        }
    }

    private async getContractSettlementData(): Promise<ContractSettlementData> {
        const invoiceStatuses = Object.values(Setup.InvoiceStatus).filter(
            (status) =>
                status !== Setup.InvoiceStatus.WITHDRAWN &&
                status !== Setup.InvoiceStatus.TO_CORRECT
        );
        const contractSettlementData =
            await ContractsSettlementController.getSums([
                {
                    id: this.contract.id,
                    invoiceStatuses: invoiceStatuses,
                },
            ]);
        console.log(contractSettlementData);
        return contractSettlementData[0];
    }

    private checkNewInvoiceValue(
        contractSettlementData: ContractSettlementData
    ) {
        if (this.invoice._totalNetValue === undefined) {
            this.invoice._totalNetValue = 0;
        }
        if (
            this.invoice._totalNetValue >
            contractSettlementData.remainingRegisteredValue
        ) {
            const contractValue = this.contract.value as number;
            throw new Error(
                `Nie można dodać nowej faktury, ponieważ suma wartości wcześniejszych faktur i tej faktury (${this.invoice._totalNetValue} zł) ` +
                    `przekracza wartość umowy (${Tools.formatNumber(
                        contractValue
                    )} zł). \n` +
                    `Wartość umowy: ${Tools.formatNumber(
                        contractValue
                    )} zł \n` +
                    `Wartość wcześniejszych faktur(wszystkie statusy): ${Tools.formatNumber(
                        contractSettlementData.totalIssuedValue
                    )} zł \n` +
                    `Wskazówka: sprawdź w widoku kontraktu czy nie ma zapomnianych faktur o statusie "Na Później".`
            );
        }
    }

    private checkExistingInvoiceValue(
        contractSettlementData: ContractSettlementData
    ) {
        if (this.invoice._totalNetValue === undefined) {
            throw new Error('Wartość faktury nie została ustawiona');
        }
    }

    /**
     * Analogous to CostInvoiceValidator.validatePaymentUpdate.
     * Returns an error message or null if valid.
     */
    static validatePaymentUpdate(
        body: Record<string, unknown>,
        grossAmount?: number,
    ): string | null {
        const { paymentStatus, paidAmount } = body;

        if (paymentStatus !== undefined) {
            if (!VALID_INVOICE_PAYMENT_STATUSES.includes(paymentStatus as InvoicePaymentStatus)) {
                return `Nieprawidłowy status płatności: ${paymentStatus}`;
            }
        }

        let parsedPaidAmount: number | undefined;
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

        if (parsedPaidAmount !== undefined && grossAmount !== undefined && grossAmount >= 0) {
            if (parsedPaidAmount > grossAmount) {
                return `Kwota płatności (${parsedPaidAmount}) nie może przekroczyć kwoty brutto faktury (${grossAmount})`;
            }
        }

        if (paymentStatus !== undefined && parsedPaidAmount !== undefined) {
            const status = paymentStatus as InvoicePaymentStatus;
            if ((status === 'UNPAID' || status === 'NOT_APPLICABLE') && parsedPaidAmount !== 0) {
                return `Status ${status} wymaga paidAmount = 0`;
            }
            if (status === 'PAID' && grossAmount !== undefined && parsedPaidAmount !== grossAmount) {
                return `Status PAID wymaga paidAmount = grossAmount (${grossAmount})`;
            }
            if (status === 'PARTIALLY_PAID') {
                if (parsedPaidAmount === 0) return 'Status PARTIALLY_PAID wymaga paidAmount > 0';
                if (grossAmount !== undefined && parsedPaidAmount >= grossAmount) {
                    return `Status PARTIALLY_PAID wymaga paidAmount < grossAmount (${grossAmount})`;
                }
            }
        }

        if (paymentStatus !== undefined && paidAmount === undefined) {
            const status = paymentStatus as InvoicePaymentStatus;
            if (status === 'PARTIALLY_PAID') {
                return 'Status PARTIALLY_PAID wymaga podania paidAmount';
            }
        }

        return null;
    }
}
