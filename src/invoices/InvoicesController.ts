import Invoice from './Invoice';
import InvoiceRepository, { InvoicesSearchParams } from './InvoiceRepository';
import BaseController from '../controllers/BaseController';
import { InvoiceData } from '../types/types';
import { UserData } from '../types/sessionTypes';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Setup from '../setup/Setup';
import InvoiceItemsController from './InvoiceItemsController';
import PersonsController from '../persons/PersonsController';
import { OAuth2Client } from 'google-auth-library';
import ContractOur from '../contracts/ContractOur';
import ToolsGd from '../tools/ToolsGd';
import InvoiceValidator from './InvoiceValidator';
import { drive_v3 } from 'googleapis';
import KsefController from './KSeF/KsefController';

export type { InvoicesSearchParams };

export default class InvoicesController extends BaseController<
    Invoice,
    InvoiceRepository
> {
    private static instance: InvoicesController;

    constructor() {
        super(new InvoiceRepository());
    }

    /**
     * Inicjuje wysyłkę faktury do KSeF.
     */
    static async sendToKsef(invoiceId: number): Promise<any> {
        const instance = this.getInstance();
        // Ensure invoice exists and items are loaded
        const invoices = await instance.repository.find([{ id: invoiceId }]);
        const invoice = invoices[0];
        if (!invoice) throw new Error(`Nie znaleziono faktury o ID: ${invoiceId}`);

        if (!invoice._items || invoice._items.length === 0) {
            invoice._items = await InvoiceItemsController.find([
                { invoiceId: invoice.id },
            ]);
        }

        // Delegate to KSeF controller which submits and saves metadata
        const result = await KsefController.submitInvoiceById(invoiceId);

        // Update invoice fields if available in result.meta
        const meta = result.meta || {};
        if (meta.ksefId || meta.status || meta.upo) {
            invoice.ksefSessionId = meta.ksefId || invoice.ksefSessionId;
            invoice.ksefStatus = meta.status || invoice.ksefStatus;
            invoice.ksefUpo = meta.upo || invoice.ksefUpo;
            try {
                await instance.repository.editInDb(invoice, undefined, undefined, [
                    'ksefSessionId',
                    'ksefStatus',
                    'ksefUpo',
                ]);
            } catch (err) {
                console.error('Failed to persist KSeF fields on invoice', err);
            }
        }

        return result;
    }

    /**
     * Sprawdza status przetwarzania faktury w KSeF i aktualizuje rekord.
     */
    static async checkKsefStatus(invoiceId: number): Promise<any> {
        const instance = this.getInstance();
        const invoices = await instance.repository.find([{ id: invoiceId }]);
        const invoice = invoices[0];
        if (!invoice || !invoice.ksefSessionId)
            throw new Error(`Faktura nie jest przetwarzana w KSeF.`);

        const statusResult = await KsefController.getStatusByInvoiceId(invoiceId);
        // statusResult may contain meta and status
        const meta = statusResult.meta || {};
        const status = statusResult.status || null;

        if (status) {
            invoice.ksefStatus = status;
            if (meta.ksefNumber) invoice.ksefNumber = meta.ksefNumber;
            if (meta.upo) invoice.ksefUpo = meta.upo;
            try {
                await instance.repository.editInDb(invoice, undefined, undefined, [
                    'ksefStatus',
                    'ksefNumber',
                    'ksefUpo',
                ]);
            } catch (err) {
                console.error('Failed to update invoice with KSeF status', err);
            }
        }

        return { invoice, statusResult };
    }

    private static getInstance(): InvoicesController {
        if (!this.instance) {
            this.instance = new InvoicesController();
        }
        return this.instance;
    }

    // ==================== READ (bez auth) ====================
    /**
     * Wyszukuje faktury według parametrów
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<Invoice[]> - Lista faktur
     */
    static async find(
        searchParams: InvoicesSearchParams[] = []
    ): Promise<Invoice[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    // ==================== CREATE ====================
    /**
     * API PUBLICZNE
     * Dodaje nową fakturę do systemu
     *
     * @param invoiceData - Dane faktury do dodania
     * @returns Promise<Invoice> - Dodana faktura
     */
    static async add(invoiceData: InvoiceData): Promise<Invoice> {
        const instance = this.getInstance();
        return await instance.addInvoice(invoiceData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje fakturę do DB z walidacją
     *
     * @param invoiceData - Dane faktury do dodania
     * @returns Promise<Invoice> - Dodana faktura
     */
    private async addInvoice(invoiceData: InvoiceData): Promise<Invoice> {
        console.group('InvoicesController.addInvoice()');
        try {
            const invoice = new Invoice(invoiceData);
            const validator = new InvoiceValidator(
                new ContractOur(invoice._contract),
                invoice
            );
            await validator.checkValueWithContract(true);

            await this.create(invoice);
            console.log(
                `Invoice for contract ${invoice._contract.ourId} added in db`
            );
            return invoice;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== UPDATE ====================
    /**
     * API PUBLICZNE
     * Aktualizuje istniejącą fakturę
     *
     * @param invoiceData - Dane faktury do aktualizacji
     * @param fieldsToUpdate - Lista pól do aktualizacji
     * @param authSignal - Sygnał 'FETCH_TOKEN' jeśli potrzebny OAuth (withAuth sam pobierze token)
     * @returns Promise<Invoice> - Zaktualizowana faktura
     */
    static async edit(
        invoiceData: InvoiceData,
        fieldsToUpdate?: string[],
        authSignal?: string
    ): Promise<Invoice> {
        if (authSignal === 'FETCH_TOKEN') {
            return await this.withAuth<Invoice>(
                async (
                    instance: InvoicesController,
                    authClient: OAuth2Client
                ) => {
                    return await instance.editInvoice(
                        authClient,
                        invoiceData,
                        fieldsToUpdate
                    );
                }
            );
        } else {
            const instance = this.getInstance();
            return await instance.editInvoice(
                undefined,
                invoiceData,
                fieldsToUpdate
            );
        }
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Edytuje fakturę w DB, opcjonalnie usuwa plik GD
     *
     * @param auth - Opcjonalny OAuth2Client dla operacji GD
     * @param invoiceData - Dane faktury do aktualizacji
     * @param fieldsToUpdate - Lista pól do aktualizacji
     * @returns Promise<Invoice> - Zaktualizowana faktura
     */
    private async editInvoice(
        auth: OAuth2Client | undefined,
        invoiceData: InvoiceData,
        fieldsToUpdate?: string[]
    ): Promise<Invoice> {
        console.group('InvoicesController.editInvoice()');
        try {
            const invoice = new Invoice(invoiceData);

            if (
                auth &&
                invoice.gdId &&
                invoice.status?.match(/Na później|Do zrobienia/i)
            ) {
                await ToolsGd.trashFile(auth, invoice.gdId);
                invoice.setGdIdAndUrl(null);
                if (fieldsToUpdate && !fieldsToUpdate.includes('gdId')) {
                    fieldsToUpdate.push('gdId');
                }
            }

            await this.repository.editInDb(
                invoice,
                undefined,
                undefined,
                fieldsToUpdate
            );
            console.log(`Invoice ${invoice.id} updated in db`);
            return invoice;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE
     * Aktualizuje status faktury
     *
     * @param invoiceData - Dane faktury
     * @param newStatus - Nowy status
     * @returns Promise<Invoice> - Zaktualizowana faktura
     */
    static async updateStatus(
        invoiceData: InvoiceData,
        newStatus: string
    ): Promise<Invoice> {
        const instance = this.getInstance();
        return await instance.updateInvoiceStatus(invoiceData, newStatus);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Aktualizuje status faktury z inicjalizacją pól
     *
     * @param invoiceData - Dane faktury
     * @param newStatus - Nowy status
     * @returns Promise<Invoice> - Zaktualizowana faktura
     */
    private async updateInvoiceStatus(
        invoiceData: InvoiceData,
        newStatus: string
    ): Promise<Invoice> {
        console.group('InvoicesController.updateInvoiceStatus()');
        try {
            const invoice = new Invoice({ ...invoiceData, status: newStatus });
            invoice.status = newStatus;
            invoice.initByStatus(newStatus, invoice);
            const fieldsToUpdate = [
                'status',
                'number',
                'sentDate',
                'paymentDeadline',
                'gdId',
            ];
            await this.repository.editInDb(
                invoice,
                undefined,
                undefined,
                fieldsToUpdate
            );
            console.log(`Invoice ${invoice.id} status updated to ${newStatus}`);
            return invoice;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE
     * Wystawia fakturę i uploaduje plik do GD
     *
     * @param invoiceData - Dane faktury
     * @param invoiceFile - Plik faktury do uploadu
     * @param authSignal - Sygnał 'FETCH_TOKEN' (withAuth sam pobierze token)
     * @returns Promise<Invoice> - Wystawiona faktura
     */
    static async issue(
        invoiceData: InvoiceData,
        invoiceFile: Express.Multer.File,
        authSignal?: string
    ): Promise<Invoice> {
        // authSignal jest zawsze potrzebny dla issue - zawsze uploadujemy do GD
        return await this.withAuth<Invoice>(
            async (instance: InvoicesController, authClient: OAuth2Client) => {
                return await instance.issueInvoice(
                    authClient,
                    invoiceData,
                    invoiceFile
                );
            }
        );
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Wystawia fakturę - uploaduje plik do GD i aktualizuje DB
     *
     * @param auth - OAuth2Client dla operacji GD
     * @param invoiceData - Dane faktury
     * @param invoiceFile - Plik faktury do uploadu
     * @returns Promise<Invoice> - Wystawiona faktura
     */
    private async issueInvoice(
        auth: OAuth2Client,
        invoiceData: InvoiceData,
        invoiceFile: Express.Multer.File
    ): Promise<Invoice> {
        console.group('InvoicesController.issueInvoice()');
        try {
            const parentGdFolderId = '1WsNoU0m9BoeVHeb_leAFwtRa94k0CD71';
            const item = new Invoice({ ...invoiceData, status: 'Zrobiona' });

            if (item.gdId) {
                await ToolsGd.trashFile(auth, item.gdId);
            }

            const fileData: drive_v3.Schema$File =
                await ToolsGd.uploadFileMulter(
                    auth,
                    invoiceFile,
                    undefined,
                    parentGdFolderId
                );

            item.setGdIdAndUrl(fileData.id);

            const fieldsToUpdate = [
                'status',
                'gdId',
                'number',
                'sentDate',
                'paymentDeadline',
            ];
            await this.repository.editInDb(
                item,
                undefined,
                undefined,
                fieldsToUpdate
            );

            console.log(`Invoice ${item.number} issued and file uploaded`);
            return item;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================
    /**
     * API PUBLICZNE
     * Usuwa fakturę z systemu
     *
     * @param invoiceData - Dane faktury do usunięcia
     * @param authSignal - Sygnał 'FETCH_TOKEN' jeśli potrzebny OAuth (withAuth sam pobierze token)
     * @returns Promise<{id: number | undefined}> - ID usuniętej faktury
     */
    static async delete(
        invoiceData: InvoiceData,
        authSignal?: string
    ): Promise<{ id: number | undefined }> {
        if (authSignal === 'FETCH_TOKEN') {
            return await this.withAuth<{ id: number | undefined }>(
                async (
                    instance: InvoicesController,
                    authClient: OAuth2Client
                ) => {
                    return await instance.deleteInvoice(
                        authClient,
                        invoiceData
                    );
                }
            );
        } else {
            const instance = this.getInstance();
            return await instance.deleteInvoice(undefined, invoiceData);
        }
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa fakturę z DB i opcjonalnie plik GD
     *
     * @param auth - Opcjonalny OAuth2Client dla operacji GD
     * @param invoiceData - Dane faktury do usunięcia
     * @returns Promise<{id: number | undefined}> - ID usuniętej faktury
     */
    private async deleteInvoice(
        auth: OAuth2Client | undefined,
        invoiceData: InvoiceData
    ): Promise<{ id: number | undefined }> {
        console.group('InvoicesController.deleteInvoice()');
        try {
            const invoice = new Invoice(invoiceData);

            const promises = [this.repository.deleteFromDb(invoice)];

            if (auth && invoice.gdId) {
                promises.push(ToolsGd.trashFile(auth, invoice.gdId));
            } else if (!auth && invoice.gdId) {
                console.warn(
                    `Invoice ${invoice.id} has a gdId, but no auth client was provided. File will not be deleted from Google Drive.`
                );
            }

            await Promise.all(promises);

            console.log(`Invoice with id ${invoice.id} deleted`);
            return { id: invoice.id };
        } finally {
            console.groupEnd();
        }
    }

    // ==================== COPY ====================
    /**
     * API PUBLICZNE
     * Kopiuje fakturę wraz z pozycjami
     *
     * @param invoiceToCopyData - Dane faktury do skopiowania
     * @param userData - Dane użytkownika z sesji
     * @returns Promise<Invoice> - Skopiowana faktura
     */
    static async copy(
        invoiceToCopyData: InvoiceData,
        userData: UserData
    ): Promise<Invoice> {
        const instance = this.getInstance();
        return await instance.copyInvoice(invoiceToCopyData, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Kopiuje fakturę i jej pozycje w transakcji DB
     *
     * @param invoiceToCopyData - Dane faktury do skopiowania
     * @param userData - Dane użytkownika z sesji
     * @returns Promise<Invoice> - Skopiowana faktura
     */
    private async copyInvoice(
        invoiceToCopyData: InvoiceData,
        userData: UserData
    ): Promise<Invoice> {
        console.group('InvoicesController.copyInvoice()');
        try {
            const item = new Invoice(invoiceToCopyData);
            const validator = new InvoiceValidator(
                new ContractOur(item._contract),
                item
            );
            await validator.checkValueWithContract(true);

            return await ToolsDb.transaction(
                async (conn: mysql.PoolConnection) => {
                    console.log(
                        'copyController for invoice',
                        invoiceToCopyData.id
                    );

                    const invoiceCopyData: InvoiceData = {
                        ...invoiceToCopyData,
                        id: undefined,
                        description: invoiceToCopyData.description
                            ? invoiceToCopyData.description.endsWith(' KOPIA')
                                ? invoiceToCopyData.description
                                : invoiceToCopyData.description + ' KOPIA'
                            : 'KOPIA',
                        status: Setup.InvoiceStatus.FOR_LATER,
                        gdId: null,
                        _documentOpenUrl: undefined,
                        number: null,
                        sentDate: null,
                        paymentDeadline: null,
                    };

                    const invoiceCopy = await InvoicesController.add(
                        invoiceCopyData
                    );

                    const originalItems = await InvoiceItemsController.find([
                        { invoiceId: invoiceToCopyData.id },
                    ]);

                    for (const itemData of originalItems) {
                        const newItemData = {
                            ...itemData,
                            id: undefined,
                            _parent: invoiceCopy,
                            _editor:
                                await PersonsController.getPersonFromSessionUserData(
                                    userData
                                ),
                        };
                        await InvoiceItemsController.addNewInvoiceItem(
                            newItemData,
                            userData
                        );
                    }
                    return invoiceCopy;
                }
            );
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DEPRECATED (dla kompatybilności wstecznej) ====================
    /**
     * @deprecated Użyj InvoicesController.add(invoiceData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async addNewInvoice(invoiceData: InvoiceData): Promise<Invoice> {
        return await this.add(invoiceData);
    }

    /**
     * @deprecated Użyj InvoicesController.edit(invoiceData, fieldsToUpdate, 'FETCH_TOKEN') zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async updateInvoice(
        invoiceData: InvoiceData,
        fieldsToUpdate?: string[],
        auth?: OAuth2Client
    ): Promise<Invoice> {
        return await this.edit(
            invoiceData,
            fieldsToUpdate,
            auth ? 'FETCH_TOKEN' : undefined
        );
    }

    /**
     * @deprecated Użyj InvoicesController.updateStatus(invoiceData, newStatus) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async updateInvoiceStatus(
        invoiceData: InvoiceData,
        newStatus: string
    ): Promise<Invoice> {
        return await this.updateStatus(invoiceData, newStatus);
    }

    /**
     * @deprecated Użyj InvoicesController.issue(invoiceData, invoiceFile, 'FETCH_TOKEN') zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async issueInvoice(
        invoiceData: InvoiceData,
        invoiceFile: Express.Multer.File,
        auth: OAuth2Client
    ): Promise<Invoice> {
        return await this.issue(invoiceData, invoiceFile, 'FETCH_TOKEN');
    }

    /**
     * @deprecated Użyj InvoicesController.delete(invoiceData, 'FETCH_TOKEN') zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async deleteInvoice(
        invoiceData: InvoiceData,
        auth?: OAuth2Client
    ): Promise<{ id: number | undefined }> {
        return await this.delete(invoiceData, auth ? 'FETCH_TOKEN' : undefined);
    }

    /**
     * @deprecated Użyj InvoicesController.copy(invoiceToCopyData, userData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async copyInvoice(
        invoiceToCopyData: InvoiceData,
        userData: UserData
    ): Promise<Invoice> {
        return await this.copy(invoiceToCopyData, userData);
    }
}
