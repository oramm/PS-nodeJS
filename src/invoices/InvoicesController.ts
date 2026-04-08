import Invoice from './Invoice';
import InvoiceRepository, { InvoicesSearchParams } from './InvoiceRepository';
import BaseController from '../controllers/BaseController';
import { InvoiceData, InvoiceThirdPartyData } from '../types/types';
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

    private static getInstance(): InvoicesController {
        if (!this.instance) {
            this.instance = new InvoicesController();
        }
        return this.instance;
    }

    // ==================== READ (bez auth) ====================
    /**
     * Wyszukuje faktury według parametrów
     * Dla każdej faktury dołącza listę jej korekt (_corrections)
     * 
     * @param searchParams - Parametry wyszukiwania
     * @param includeCorrections - Czy dołączyć korekty (domyślnie true)
     * @returns Promise<Invoice[]> - Lista faktur z korektami
     */
    static async find(
        searchParams: InvoicesSearchParams[] = [],
        includeCorrections: boolean = true
    ): Promise<Invoice[]> {
        const instance = this.getInstance();
        const invoices = await instance.repository.find(searchParams);

        // Pobierz korekty dla wszystkich faktur jednym zapytaniem
        if (includeCorrections && invoices.length > 0) {
            const invoiceIds = invoices
                .map(inv => inv.id)
                .filter((id): id is number => id !== undefined);
            
            const correctionsMap = await instance.repository.findCorrectionsBulk(invoiceIds);
            
            // Przypisz korekty do faktur
            invoices.forEach(invoice => {
                if (invoice.id !== undefined) {
                    invoice._corrections = correctionsMap.get(invoice.id) || [];
                }
            });
        }

        return invoices;
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
            this.normalizeThirdPartyState(invoice);
            this.validateThirdPartyRules(invoice);
            const validator = new InvoiceValidator(
                new ContractOur(invoice._contract),
                invoice
            );
            await validator.checkValueWithContract(true);

            await ToolsDb.transaction(async (conn) => {
                await this.repository.addInDb(invoice, conn, true);
                if (!invoice.id) {
                    throw new Error('Invoice id missing after insert');
                }
                await this.repository.replaceThirdPartiesInDb(
                    invoice.id,
                    invoice._thirdParties || [],
                    conn,
                );
            });
            console.log(
                `Invoice for contract ${invoice._contract.ourId} added in db`
            );
            return invoice;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== CORRECTION INVOICE ====================
    /**
     * API PUBLICZNE
     * Tworzy fakturę korygującą na podstawie oryginalnej faktury
     * 
     * @param originalInvoiceId - ID faktury do skorygowania
     * @param correctionType - Typ korekty: 'zero' (anulowanie) lub 'custom' (własne pozycje)
     * @param correctionReason - Przyczyna korekty
     * @param userData - Dane użytkownika z sesji
     * @param customItems - Własne pozycje korekty (tylko dla typu 'custom')
     * @returns Promise<Invoice> - Utworzona faktura korygująca (zapisana w DB)
     */
    static async createCorrectionInvoice(
        originalInvoiceId: number,
        correctionType: 'zero' | 'custom',
        correctionReason: string,
        userData: UserData,
        customItems?: Array<{
            description: string;
            quantity: number;
            unitPrice: number;
            vatTax: number;
        }>,
        invoiceFile?: Express.Multer.File,
        dates?: {
            issueDate?: string;
            sentDate?: string;
        }
    ): Promise<Invoice> {
        const instance = this.getInstance();
        console.group('InvoicesController.createCorrectionInvoice()');
        
        try {
            // 1. Pobierz oryginalną fakturę z pozycjami
            const originalInvoices = await instance.repository.find([{ id: originalInvoiceId }]);
            const originalInvoice = originalInvoices[0];
            if (!originalInvoice) {
                throw new Error(`Faktura ${originalInvoiceId} nie znaleziona`);
            }

            // 2. Pobierz pozycje oryginalnej faktury
            const originalItems = await InvoiceItemsController.find([{ invoiceId: originalInvoiceId }]);
            if (!originalItems || originalItems.length === 0) {
                throw new Error(`Faktura ${originalInvoiceId} nie ma pozycji`);
            }

            // 3. Utwórz nową fakturę korygującą
            const today = new Date().toISOString().split('T')[0];
            // Normalizuj bazowy numer oryginalnej faktury (usuń wiodące FV/ jeśli istnieje)
            const baseOriginalNumber = originalInvoice.number
                ? originalInvoice.number.replace(/^FV\/?/, '')
                : String(originalInvoiceId);

            // Pobierz istniejące korekty i wybierz następny indeks n
            const existingCorrections = await instance.repository.findCorrections(originalInvoiceId);
            let maxN = 0;
            for (const c of existingCorrections) {
                if (!c.number) continue;
                const m = c.number.match(/^FV-K_(\d+)\/(.+)$/);
                if (m && m[2] === baseOriginalNumber) {
                    const val = parseInt(m[1], 10);
                    if (!isNaN(val) && val > maxN) maxN = val;
                }
            }
            const nextN = maxN + 1;
            const correctionNumber = `FV-K_${nextN}/${baseOriginalNumber}`;

            const correctionIssueDate =
                dates?.issueDate || originalInvoice.issueDate || today;
            const correctionSentDate = dates?.sentDate || today;

            const correctionInvoiceData: InvoiceData = {
                number: correctionNumber,
                description: `Korekta do faktury ${originalInvoice.number || originalInvoiceId}: ${correctionReason}`,
                issueDate: correctionIssueDate,
                sentDate: correctionSentDate,
                daysToPay: originalInvoice.daysToPay,
                status: Setup.InvoiceStatus.SENT, // Korekta od razu gotowa do dalszych kroków KSeF
                _contract: originalInvoice._contract,
                _entity: originalInvoice._entity,
                isJstSubordinate: originalInvoice.isJstSubordinate,
                isGvMember: originalInvoice.isGvMember,
                includeThirdParty: originalInvoice.includeThirdParty,
                thirdPartyEntityId: originalInvoice.thirdPartyEntityId,
                _thirdParty: originalInvoice._thirdParty,
                _thirdParties: originalInvoice._thirdParties,
                _editor: originalInvoice._editor,
                _owner: originalInvoice._owner,
                correctedInvoiceId: originalInvoiceId,
                correctionReason: correctionReason,
            };

            const correctionInvoice = new Invoice(correctionInvoiceData);
            instance.normalizeThirdPartyState(correctionInvoice);
            instance.validateThirdPartyRules(correctionInvoice);
            
            // 4. Walidacja
            const validator = new InvoiceValidator(
                new ContractOur(correctionInvoice._contract),
                correctionInvoice
            );
            await validator.checkValueWithContract(true);

            // 5. Zapisz fakturę korygującą
            await ToolsDb.transaction(async (conn) => {
                await instance.repository.addInDb(correctionInvoice, conn, true);
                if (!correctionInvoice.id) {
                    throw new Error('Invoice id missing after insert');
                }
                await instance.repository.replaceThirdPartiesInDb(
                    correctionInvoice.id,
                    correctionInvoice._thirdParties || [],
                    conn,
                );
            });
            
            // Sprawdź czy id zostało ustawione
            if (!correctionInvoice.id) {
                throw new Error('Błąd krytyczny: Faktura korygująca nie otrzymała ID po zapisie do bazy');
            }
            console.log(`Faktura korygująca ${correctionInvoice.id} utworzona`);

            // 6. Utwórz pozycje korekty
            let itemsToCreate: Array<{
                description: string;
                quantity: number;
                unitPrice: number;
                vatTax: number;
            }>;

            if (correctionType === 'zero') {
                // Korekta do zera - zaneguj wszystkie pozycje oryginału
                itemsToCreate = originalItems.map(item => ({
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: -Math.abs(item.unitPrice), // Ujemna cena = korekta in minus
                    vatTax: item.vatTax,
                }));
            } else if (customItems && customItems.length > 0) {
                // Korekta z własnymi pozycjami
                itemsToCreate = customItems;
            } else {
                throw new Error('Dla typu "custom" wymagane są pozycje korekty (customItems)');
            }

            // 7. Dodaj pozycje do faktury korygującej
            for (const itemData of itemsToCreate) {
                await InvoiceItemsController.addNewInvoiceItem({
                    description: itemData.description,
                    quantity: itemData.quantity,
                    unitPrice: itemData.unitPrice,
                    vatTax: itemData.vatTax,
                    _parent: correctionInvoice as any,
                    _editor: correctionInvoice._editor as any,
                    _lastUpdated: today,
                    _grossValue: 0,
                    _netValue: 0,
                    _vatValue: 0,
                }, userData);
            }
            console.log(`Dodano ${itemsToCreate.length} pozycji do faktury korygującej`);

            // 8. Opcjonalnie: oznacz oryginalną fakturę jako skorygowaną
            if (correctionType === 'zero') {
                originalInvoice.status = Setup.InvoiceStatus.WITHDRAWN;
                await instance.repository.editInDb(originalInvoice, undefined, undefined, ['status']);
                console.log(`Oryginalna faktura ${originalInvoiceId} oznaczona jako wycofana`);
            }

            // 9. Upload pliku do Google Drive (jeśli załączono)
            if (invoiceFile) {
                await InvoicesController.withAuth(async (inst, authClient) => {
                    const parentGdFolderId = '1WsNoU0m9BoeVHeb_leAFwtRa94k0CD71';
                    
                    // Usuń stary plik jeśli istnieje
                    if (correctionInvoice.gdId) {
                        await ToolsGd.trashFile(authClient, correctionInvoice.gdId);
                    }
                    
                    // Upload nowego pliku
                    const fileData = await ToolsGd.uploadFileMulter(
                        authClient,
                        invoiceFile,
                        undefined,
                        parentGdFolderId
                    );
                    
                    correctionInvoice.setGdIdAndUrl(fileData.id);
                    await inst.repository.editInDb(correctionInvoice, undefined, undefined, ['gdId']);
                    console.log(`Plik załączony do korekty ${correctionInvoice.id}, gdId: ${fileData.id}`);
                });
            }

            return correctionInvoice;
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
            await this.hydrateThirdPartyRulesStateFromDb(invoice, fieldsToUpdate);
            this.normalizeThirdPartyState(invoice, fieldsToUpdate);
            this.validateThirdPartyRules(invoice);

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

            await ToolsDb.transaction(async (conn) => {
                await this.repository.editInDb(
                    invoice,
                    conn,
                    true,
                    fieldsToUpdate,
                );
                if (!invoice.id) {
                    throw new Error('Invoice id missing for third-party update');
                }
                await this.repository.replaceThirdPartiesInDb(
                    invoice.id,
                    invoice._thirdParties || [],
                    conn,
                );
            });
            console.log(`Invoice ${invoice.id} updated in db`);
            return invoice;
        } finally {
            console.groupEnd();
        }
    }

    private async hydrateThirdPartyRulesStateFromDb(
        invoice: Invoice,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        if (!invoice.id || !fieldsToUpdate?.length) {
            return;
        }

        const existing = (await this.repository.find([{ id: invoice.id }]))[0];
        if (!existing) {
            return;
        }

        const updates = new Set(fieldsToUpdate);

        if (!fieldsToUpdate.includes('isJstSubordinate')) {
            invoice.isJstSubordinate = existing.isJstSubordinate;
        }
        if (!fieldsToUpdate.includes('isGvMember')) {
            invoice.isGvMember = existing.isGvMember;
        }
        if (!fieldsToUpdate.includes('includeThirdParty')) {
            invoice.includeThirdParty = existing.includeThirdParty;
        }
        if (!updates.has('_thirdParties')) {
            invoice._thirdParties = existing._thirdParties;
        }
        if (updates.has('_thirdParty') && !updates.has('thirdPartyEntityId')) {
            invoice.thirdPartyEntityId =
                invoice._thirdParty?.id ?? invoice.thirdPartyEntityId ?? null;
            fieldsToUpdate.push('thirdPartyEntityId');
            updates.add('thirdPartyEntityId');
        } else if (!updates.has('thirdPartyEntityId')) {
            invoice.thirdPartyEntityId = existing.thirdPartyEntityId;
        }
        if (!updates.has('_thirdParty')) {
            invoice._thirdParty = existing._thirdParty;
        }
    }

    private normalizeThirdPartyState(
        invoice: Invoice,
        fieldsToUpdate?: string[]
    ): void {
        const rawList = Array.isArray(invoice._thirdParties)
            ? invoice._thirdParties
            : [];
        const normalizedList = rawList
            .map((item) => {
                const entityId = item.entityId ?? item._entity?.id ?? null;
                const role = Number(item.role);
                if (!entityId || !Number.isFinite(role)) {
                    return null;
                }
                return {
                    entityId,
                    role,
                    _entity: item._entity,
                } as InvoiceThirdPartyData;
            })
            .filter(Boolean) as InvoiceThirdPartyData[];

        const fallbackEntityId = invoice._thirdParty?.id ?? invoice.thirdPartyEntityId ?? null;

        if (!normalizedList.length && invoice.includeThirdParty && fallbackEntityId) {
            const fallbackRole = invoice.isJstSubordinate
                ? 8
                : invoice.isGvMember
                  ? 10
                  : 10;
            normalizedList.push({
                entityId: fallbackEntityId,
                role: fallbackRole,
                _entity: invoice._thirdParty,
            });
        }

        invoice._thirdParties = normalizedList;
        invoice.includeThirdParty = normalizedList.length > 0;
        invoice.thirdPartyEntityId = normalizedList[0]?.entityId ?? null;
        invoice._thirdParty = normalizedList[0]?._entity;

        if (fieldsToUpdate) {
            if (!fieldsToUpdate.includes('includeThirdParty')) {
                fieldsToUpdate.push('includeThirdParty');
            }
            if (!fieldsToUpdate.includes('thirdPartyEntityId')) {
                fieldsToUpdate.push('thirdPartyEntityId');
            }
        }
    }

    private validateThirdPartyRules(invoice: Invoice): void {
        const isJstSubordinate = invoice.isJstSubordinate === true;
        const isGvMember = invoice.isGvMember === true;
        const includeThirdParty = invoice.includeThirdParty === true;
        const thirdParties = invoice._thirdParties || [];

        if ((isJstSubordinate || isGvMember) && !includeThirdParty) {
            throw new Error('Podmiot 3 jest wymagany gdy zaznaczono JST lub GV');
        }

        if (includeThirdParty && !thirdParties.length) {
            throw new Error('Dla Podmiotu 3 wybierz co najmniej jedną encję');
        }

        const hasJstRole = thirdParties.some((item) => item.role === 8);
        const hasGvRole = thirdParties.some((item) => item.role === 10);

        if (isJstSubordinate && !hasJstRole) {
            throw new Error('Dla JST wymagany jest Podmiot 3 z rolą 8');
        }

        if (isGvMember && !hasGvRole) {
            throw new Error('Dla GV wymagany jest Podmiot 3 z rolą 10');
        }

        for (const thirdParty of thirdParties) {
            if (!thirdParty.entityId) {
                throw new Error('Każdy Podmiot 3 musi mieć wybraną encję');
            }
            if (!Number.isInteger(thirdParty.role) || thirdParty.role < 1 || thirdParty.role > 10) {
                throw new Error('Rola Podmiotu 3 musi być w zakresie 1-10');
            }
        }

        if (!includeThirdParty) {
            invoice.thirdPartyEntityId = null;
            invoice._thirdParty = undefined;
            invoice._thirdParties = [];
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
     * Wystawia fakturę i opcjonalnie uploaduje plik do GD
     *
     * @param invoiceData - Dane faktury
     * @param invoiceFile - Plik faktury do uploadu (opcjonalny)
     * @param authSignal - Sygnał 'FETCH_TOKEN' (withAuth sam pobierze token)
     * @returns Promise<Invoice> - Wystawiona faktura
     */
    static async issue(
        invoiceData: InvoiceData,
        invoiceFile?: Express.Multer.File,
        authSignal?: string
    ): Promise<Invoice> {
        // authSignal jest zawsze potrzebny dla issue - zawsze uploadujemy do GD jeśli plik dostępny
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
     * Wystawia fakturę - opcjonalnie uploaduje plik do GD i aktualizuje DB
     *
     * @param auth - OAuth2Client dla operacji GD
     * @param invoiceData - Dane faktury
     * @param invoiceFile - Plik faktury do uploadu (opcjonalny)
     * @returns Promise<Invoice> - Wystawiona faktura
     */
    private async issueInvoice(
        auth: OAuth2Client,
        invoiceData: InvoiceData,
        invoiceFile?: Express.Multer.File
    ): Promise<Invoice> {
        console.group('InvoicesController.issueInvoice()');
        try {
            const parentGdFolderId = '1WsNoU0m9BoeVHeb_leAFwtRa94k0CD71';
            const item = new Invoice({ ...invoiceData, status: 'Zrobiona' });

            if (item.gdId) {
                await ToolsGd.trashFile(auth, item.gdId);
            }

            if (invoiceFile) {
                const fileData: drive_v3.Schema$File =
                    await ToolsGd.uploadFileMulter(
                        auth,
                        invoiceFile,
                        undefined,
                        parentGdFolderId
                    );

                item.setGdIdAndUrl(fileData.id);
            }
            // Jeśli plik nie był przesłany, gdId pozostaje null - to jest OK (plik to tylko archiwum)

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

            const message = invoiceFile
                ? `Invoice ${item.number} issued and file uploaded`
                : `Invoice ${item.number} issued (no file attached)`;
            console.log(message);
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
                        // Nie kopiuj danych KSeF - nowa faktura nie była wysłana
                        ksefNumber: null,
                        ksefStatus: null,
                        ksefSessionId: null,
                        ksefUpo: null,
                        // Nie kopiuj powiązań z korektą
                        correctedInvoiceId: null,
                        correctionReason: null,
                        _corrections: undefined,
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
