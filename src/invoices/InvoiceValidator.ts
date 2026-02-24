import ContractOur from '../contracts/ContractOur';
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
}
