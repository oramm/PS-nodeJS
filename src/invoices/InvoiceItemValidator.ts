import mysql from 'mysql2/promise';
import ContractOur from "../contracts/ContractOur";
import Setup from "../setup/Setup";
import ToolsDb from "../tools/ToolsDb";
import InvoiceItem from "./InvoiceItem";
import Tools from '../tools/Tools';

export default class InvoiceItemValidator {
    private contract: ContractOur;
    private invoiceItem: InvoiceItem;

    constructor(contract: ContractOur, invoiceItem: InvoiceItem) {
        this.contract = contract;
        this.invoiceItem = invoiceItem;
    }

    async checkValueAgainstContract(isNewInvoiceItem: boolean): Promise<boolean> {
        this.checkContractValueSet();
        this.checkAgainstContract(isNewInvoiceItem);
        await this.checkInvoiceItemValueAgainstRemainingValue(isNewInvoiceItem);
        return true;
    }

    private checkContractValueSet() {
        if (!this.contract.value) {
            throw new Error('Wartość kontraktu nie została ustawiona');
        }
    }

    private checkAgainstContract(isNewInvoice: boolean) {
        const contractValue = this.contract.value as number;
        if (isNewInvoice && contractValue < this.invoiceItem._netValue) {
            throw new Error(
                `Nie można dodać tej pozycji do faktury, ponieważ jej wartość ` +
                `przekracza wartość kontraktu (${Tools.formatNumber(contractValue)} zł).`
            );
        }
        if (!isNewInvoice && contractValue < this.invoiceItem._netValue) {
            throw new Error(
                `Wartość tej pozycji przekracza wartość kontraktu o ${Tools.formatNumber(this.invoiceItem._netValue - contractValue)} zł` + '\n' +
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
            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
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

        const statusCondition = ToolsDb.makeOrConditionFromValueOrArray1([
            Setup.InvoiceStatus.FOR_LATER,
            Setup.InvoiceStatus.TO_CORRECT,
            Setup.InvoiceStatus.DONE,
            Setup.InvoiceStatus.SENT,
            Setup.InvoiceStatus.PAID

        ], 'Invoices', 'Status');

        return `${contractCondition} 
            AND ${statusCondition}`;
    }

    private async checkInvoiceItemValueAgainstRemainingValue(isNewItem: boolean) {
        const issuedValue = (await this.getItemsValue()).value;
        const valueToCheck = this.invoiceItem._netValue + issuedValue;
        const contractValue = this.contract.value as number;
        if (isNewItem && valueToCheck === contractValue) {
            throw new Error(
                `Nie można dodać nowej pozycji, ponieważ suma wartości wcześniejszych faktur i tej pozycji ` +
                `jest równa się wartości umowy tj.: ${Tools.formatNumber(contractValue)} zł` + '\n' +
                `Wartość wcześniejszych faktur łacznie: ${Tools.formatNumber(issuedValue)} zł`
            );
        }
        if (isNewItem && valueToCheck > contractValue) {
            throw new Error(
                `Nie można dodać nowej pozycji, ponieważ suma wartości wcześniejszych faktur i tej pozycji ` +
                `(${valueToCheck} zł) przekracza wartość umowy o (${Tools.formatNumber(valueToCheck - contractValue)} zł).` + '\n' +
                `Wartość umowy: ${Tools.formatNumber(contractValue)} zł` + '\n' +
                `Wartość wcześniejszych faktur łacznie: ${Tools.formatNumber(issuedValue)} zł`
            );
        }
        if (!isNewItem && issuedValue > contractValue) {
            throw new Error(
                `Nie można zmienić tej pozycji, ponieważ suma wartości wcześniejszych faktur i tej pozycji ` +
                `(${Tools.formatNumber(valueToCheck)} zł) przekracza wartość umowy o (${Tools.formatNumber(valueToCheck - contractValue)} zł).` + '\n' +
                `Wartość umowy: ${Tools.formatNumber(contractValue)} zł` + '\n' +
                `Wartość wcześniejszych faktur łącznie: ${Tools.formatNumber(issuedValue)} zł`
            );
        }
    }
}
