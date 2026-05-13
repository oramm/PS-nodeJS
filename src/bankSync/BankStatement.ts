export default class BankStatement {
    id?: number;
    fileName: string;
    ourAccountNumber: string;
    periodFrom: string;
    periodTo: string;
    closingBalance?: number | null;
    importedBy?: number | null;
    importedAt?: Date;
    rawChecksum: string;

    constructor(data: Partial<BankStatement> & { fileName: string; ourAccountNumber: string; periodFrom: string; periodTo: string; rawChecksum: string }) {
        this.id = data.id;
        this.fileName = data.fileName;
        this.ourAccountNumber = data.ourAccountNumber;
        this.periodFrom = data.periodFrom;
        this.periodTo = data.periodTo;
        this.closingBalance = data.closingBalance ?? null;
        this.importedBy = data.importedBy ?? null;
        this.importedAt = data.importedAt;
        this.rawChecksum = data.rawChecksum;
    }
}
