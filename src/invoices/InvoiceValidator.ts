import ContractOur from "../contracts/ContractOur";
import ContractsSettlementController, { ContractSettlementData } from "../contracts/ContractsSettlementController";
import Setup from "../setup/Setup";
import Tools from "../tools/Tools";
import Invoice from "./Invoice";

export default class InvoiceValidator {
    private contract: ContractOur;
    private invoice: Invoice;

    constructor(contract: ContractOur, invoice: Invoice) {
        this.contract = contract;
        this.invoice = invoice;
    }

    async checkValueWithContract(isNewInvoice: boolean): Promise<boolean> {
        this.checkContractValueSet();
        this.checkInvoiceValueAgainstContract(isNewInvoice);

        const contractSettlementData = await this.getContractSettlementData();
        this.checkInvoiceValueAgainstRemainingValue(contractSettlementData, isNewInvoice);

        return true;
    }

    private checkContractValueSet() {
        if (!this.contract.value) {
            throw new Error('Wartość kontraktu nie została ustawiona');
        }
    }

    private checkInvoiceValueAgainstContract(isNewInvoice: boolean) {
        const contractValue = this.contract.value as number;
        if (isNewInvoice && contractValue <= this.invoice._totalNetValue) {
            throw new Error(`Nie można dodać nowej faktury, ponieważ jej wartość (${this.invoice._totalNetValue} zł) przekracza lub równa się wartości kontraktu (${contractValue} zł).`);
        }
        if (!isNewInvoice && contractValue < this.invoice._totalNetValue) {
            throw new Error(`Edycja:Wartość tej faktury przekracza wartość kontraktu o ${this.invoice._totalNetValue - contractValue} zł`);
        }
    }

    private async getContractSettlementData(): Promise<ContractSettlementData> {
        const invoiceStatuses = Object.values(Setup.InvoiceStatus).filter((status) => status !== Setup.InvoiceStatus.WITHDRAWN);
        const contractSettlementData = await ContractsSettlementController.getSums([{
            id: this.contract.id,
            invoiceStatuses: invoiceStatuses,
        }]);
        console.log(contractSettlementData);
        return contractSettlementData[0];
    }

    private checkInvoiceValueAgainstRemainingValue(contractSettlementData: ContractSettlementData, isNewInvoice: boolean) {
        if (isNewInvoice && this.invoice._totalNetValue >= contractSettlementData.remainingValue) {
            const contractValue = this.contract.value as number;
            throw new Error(
                `Nie można dodać nowej faktury, ponieważ suma wartości wcześniejszych faktur i tej faktury (${this.invoice._totalNetValue} zł) ` +
                `przekracza lub równa się wartości umowy (${Tools.formatNumber(contractSettlementData.remainingValue)} zł). \n` +
                `Wartość umowy: ${Tools.formatNumber(contractValue)} zł \n` +
                `Wartość wcześniejszych faktur(wszystkie statusy): ${Tools.formatNumber(contractSettlementData.totalIssuedValue)} zł \n` +
                `Wskazówka: sprawdź w widoku kontraktu czy nie ma zapomnianych faktur o statusie "Na Później".`
            );
        }
    }
}
