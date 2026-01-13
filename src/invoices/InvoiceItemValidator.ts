import mysql from 'mysql2/promise';
import ContractOur from '../contracts/ContractOur';
import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import InvoiceItem from './InvoiceItem';
import Tools from '../tools/Tools';
import InvoiceItemRepository from './InvoiceItemRepository';

export default class InvoiceItemValidator {
    private contract: ContractOur;
    private invoiceItem: InvoiceItem;
    private repository: InvoiceItemRepository;

    constructor(
        contract: ContractOur,
        invoiceItem: InvoiceItem,
        repository: InvoiceItemRepository
    ) {
        this.contract = contract;
        this.invoiceItem = invoiceItem;
        this.repository = repository;
    }

    async checkValueAgainstContract(
        isNewInvoiceItem: boolean
    ): Promise<boolean> {
        this.checkContractValueSet();
        isNewInvoiceItem
            ? this.checkNewAgainstContract()
            : this.checkEditedAgainstContract();

        isNewInvoiceItem
            ? await this.checkNewValueAgainstRemainingValue()
            : await this.checkEditedValueAgainstRemainingValue();

        return true;
    }

    private checkContractValueSet() {
        if (!this.contract.value) {
            throw new Error('Wartość kontraktu nie została ustawiona');
        }
    }

    private checkNewAgainstContract() {
        const contractValue = this.contract.value as number;
        if (contractValue < this.invoiceItem._netValue) {
            throw new Error(
                `Nie można dodać tej pozycji do faktury, ponieważ jej wartość ` +
                    `przekracza wartość kontraktu (${Tools.formatNumber(
                        contractValue
                    )} zł).`
            );
        }
    }

    private checkEditedAgainstContract() {
        const contractValue = this.contract.value as number;

        if (contractValue < this.invoiceItem._netValue) {
            throw new Error(
                `Nie można zmienić tej pozycji bo jej przekracza wartość kontraktu o ${Tools.formatNumber(
                    this.invoiceItem._netValue - contractValue
                )} zł` +
                    '\n' +
                    `Wartość kontraktu: ${Tools.formatNumber(contractValue)} zł`
            );
        }
    }

    private async getItemsValue() {
        const sql = `SELECT 
            ROUND(SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 2) as TotalNetValue
            FROM InvoiceItems
            JOIN Invoices ON Invoices.Id=InvoiceItems.ParentId
            WHERE ${this.makeAndConditions()}`;
        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            const row = result[0];
            return {
                value: parseFloat(row.TotalNetValue),
            };
        } catch (err) {
            throw err;
        }
    }

    private makeAndConditions() {
        const contractCondition = this.contract.id
            ? mysql.format(`Invoices.ContractId = ?`, [this.contract.id])
            : '1';

        const statusCondition = ToolsDb.makeOrConditionFromValueOrArray1(
            [
                Setup.InvoiceStatus.FOR_LATER,
                Setup.InvoiceStatus.TO_CORRECT,
                Setup.InvoiceStatus.DONE,
                Setup.InvoiceStatus.SENT,
                Setup.InvoiceStatus.PAID,
            ],
            'Invoices',
            'Status'
        );

        return `${contractCondition} 
            AND ${statusCondition}`;
    }

    private async checkNewValueAgainstRemainingValue() {
        const otherItemsValue = (await this.getItemsValue()).value;
        const itemsTotalValue = this.invoiceItem._netValue + otherItemsValue;
        const contractValue = this.contract.value as number;
        console.log(
            `otherItemsValue: ${otherItemsValue}, itemsTotalValue: ${itemsTotalValue}, contractValue: ${contractValue}`
        );

        if (itemsTotalValue > contractValue) {
            throw new Error(
                `Nie można dodać nowej pozycji, ponieważ suma wartości wcześniejszych faktur i tej pozycji ` +
                    `(${itemsTotalValue} zł) przekracza wartość umowy o ${Tools.formatNumber(
                        itemsTotalValue - contractValue
                    )} zł.\n` +
                    `Maksymalna wartość tej pozycji to ${Tools.formatNumber(
                        contractValue - otherItemsValue
                    )} zł \n` +
                    `Wartość umowy: ${Tools.formatNumber(contractValue)} zł\n` +
                    `Wartość wcześniejszych faktur łacznie: ${Tools.formatNumber(
                        otherItemsValue
                    )} zł`
            );
        }
    }

    private async checkEditedValueAgainstRemainingValue() {
        const [otherItemsValueObject, thisItemSaved] = await Promise.all([
            this.getItemsValue(),
            this.repository.find([{ invoiceItemId: this.invoiceItem.id }]),
        ]);
        console.log('thisItemSaved', thisItemSaved[0]._netValue);
        //wartość pozycji w bazie dla wszystkich faktur z bieżącego kontraktu bez bieżącej pozycji
        const otherItemsValue =
            otherItemsValueObject.value - thisItemSaved[0]._netValue;

        const totalIssuedValueAferEdit =
            otherItemsValue + this.invoiceItem._netValue;
        const contractValue = this.contract.value as number;
        console.log(
            `otherItemsValue: ${otherItemsValue}, totalIssuedValueAferEdit: ${totalIssuedValueAferEdit}, contractValue: ${contractValue}`
        );

        if (totalIssuedValueAferEdit > contractValue) {
            throw new Error(
                `Nie można zmienić tej pozycji, ponieważ suma wartości wcześniejszych faktur i tej pozycji ` +
                    `(${Tools.formatNumber(
                        totalIssuedValueAferEdit
                    )} zł) przekracza wartość umowy o ${Tools.formatNumber(
                        totalIssuedValueAferEdit - contractValue
                    )} zł.\n` +
                    `Maksymalna wartość tej pozycji to ${Tools.formatNumber(
                        contractValue - otherItemsValue
                    )} zł \n` +
                    `Wartość umowy: ${Tools.formatNumber(contractValue)} zł\n` +
                    `Wartość wcześniejszych faktur łącznie: ${Tools.formatNumber(
                        otherItemsValue
                    )} zł`
            );
        }
    }
}
