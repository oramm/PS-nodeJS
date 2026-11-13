import crypto from 'crypto';
import ToolsDb from '../tools/ToolsDb';
import ToolsMail from '../tools/ToolsMail';
import SbAccessController from '../sbAccess/SbAccessController';
import SbAccessRepository from '../sbAccess/SbAccessRepository';
import { SB_MAILBOX_PATTERN } from '../sbAccess/sbAccessTypes';
import { UserData } from '../types/sessionTypes';
import MailboxRepository, { MailboxRecord } from './MailboxRepository';
import DirectAdminGateway from './directAdminGateway';
import { personMailboxes } from './mailboxAccessPolicy';

export class MailboxError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

export type MailboxSelection = { mode: 'project' | 'separate' | 'none'; address?: string };
export type MailboxCreationResult = { _mailbox?: MailboxRecord; _mailboxCreated?: boolean; _mailboxError?: string };

/** Jedyny właściciel propozycji i walidacji adresu skrzynki. */
export function mailboxAddress(code: string): string {
    return `${typeof code === 'string' ? code.toLowerCase().replace(/[^a-z0-9.-]/g, '') : ''}@envi.com.pl`;
}

export function validateMailboxAddress(value: unknown): { address: string; code: string } {
    if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]{0,38}[a-z0-9])?@envi\.com\.pl$/.test(value) || value.includes('..'))
        throw new MailboxError('Podaj adres @envi.com.pl: od 1 do 40 małych liter, cyfr, kropek lub myślników, z literą lub cyfrą na początku i końcu.', 400);
    const code = value.split('@')[0].replace(/\./g, '-');
    if (!SB_MAILBOX_PATTERN.test(code)) throw new MailboxError('Nieprawidłowe oznaczenie skrzynki.', 400);
    return { address: value, code };
}

export default class MailboxController {
    private static repository = new MailboxRepository();

    static parseSelection(raw: unknown, isProject = false): MailboxSelection {
        if (raw === undefined) return { mode: 'project' };
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MailboxError('Wybierz sposób założenia skrzynki.', 400);
        const { mode, address } = raw as Record<string, unknown>;
        if (mode !== 'none' && mode !== 'project' && (mode !== 'separate' || isProject))
            throw new MailboxError('Wybierz sposób założenia skrzynki.', 400);
        if (address !== undefined && typeof address !== 'string') throw new MailboxError('Podaj poprawny adres skrzynki.', 400);
        if (mode === 'none') return { mode };
        if (address) validateMailboxAddress(address);
        return { mode, ...(address ? { address: address as string } : {}) };
    }

    static async checkAddress(address: string): Promise<void> {
        const valid = validateMailboxAddress(address);
        if (await this.repository.addressExists(valid.address, valid.code))
            throw new MailboxError('Ten adres lub jego oznaczenie jest już zajęte w PS. Wybierz inny adres.', 400);
    }

    static async validateProjectSelection(selection: MailboxSelection, ourId: string): Promise<void> {
        if (selection.mode !== 'none') await this.checkAddress(selection.address || mailboxAddress(ourId));
    }

    static async validateContractSelection(selection: MailboxSelection, projectOurId: string, ourId?: string): Promise<void> {
        if (selection.mode === 'none') return;
        if (selection.mode === 'separate') {
            if (!selection.address && !ourId)
                throw new MailboxError('Ta umowa nie ma oznaczenia ENVI. Wpisz adres osobnej skrzynki albo wybierz skrzynkę projektu.', 400);
            await this.checkAddress(selection.address || mailboxAddress(ourId!));
            return;
        }
        const project = await this.repository.project(projectOurId);
        if (!project) throw new MailboxError('Nie znaleziono projektu kontraktu.', 400);
        if (!await this.repository.forOwner(project.id, null)) await this.checkAddress(mailboxAddress(project.ourId));
    }

    /** Błąd poczty nie cofa rejestracji; hasło nie trafia do wyniku ani zadania. */
    static async afterProject(id: number, ourId: string, selection: MailboxSelection, createdByPersonId: number | null): Promise<MailboxCreationResult> {
        return this.afterCreation(async () => {
            if (selection.mode === 'none') return {};
            return this.create(selection.address || mailboxAddress(ourId), id, null, createdByPersonId);
        });
    }

    static async afterContract(id: number, selection: MailboxSelection, createdByPersonId: number | null): Promise<MailboxCreationResult> {
        return this.afterCreation(async () => {
            if (selection.mode === 'none') return {};
            const info = await this.repository.contract(id);
            if (!info) throw new MailboxError('Nie znaleziono kontraktu.', 404);
            return selection.mode === 'project'
                ? this.create(mailboxAddress(info.projectOurId), info.projectId, null, createdByPersonId)
                : this.create(selection.address || mailboxAddress(info.ourId || ''), null, id, createdByPersonId);
        });
    }

    private static async afterCreation(work: () => Promise<MailboxCreationResult>): Promise<MailboxCreationResult> {
        try { return await work(); }
        catch {
            const message = 'Rejestracja została zapisana, ale nie udało się zapisać skrzynki. Skontaktuj się z administratorem.';
            await this.report(message);
            return { _mailboxError: message };
        }
    }

    private static async create(address: string, projectId: number | null, contractId: number | null, createdByPersonId: number | null): Promise<MailboxCreationResult> {
        const existing = await this.repository.forOwner(projectId, contractId);
        if (existing) return { _mailbox: existing, _mailboxCreated: false };
        const valid = validateMailboxAddress(address);
        let mailbox: MailboxRecord;
        try { mailbox = await this.repository.reserve(valid.address, valid.code, projectId, contractId, createdByPersonId); }
        catch (error) {
            // Równoległy kontrakt mógł właśnie zarezerwować tę samą skrzynkę projektu.
            const reserved = await this.repository.forOwner(projectId, contractId);
            if (reserved) return { _mailbox: reserved, _mailboxCreated: false };
            throw error;
        }
        return { _mailbox: await this.provision(mailbox.id!), _mailboxCreated: true };
    }

    static async provision(id: number): Promise<MailboxRecord> {
        let createdAddress: string | undefined;
        let current: MailboxRecord | undefined;
        try {
            return await ToolsDb.transaction(async (conn) => {
                const mailbox = await this.repository.get(id, conn, true);
                if (!mailbox) throw new MailboxError('Nie znaleziono skrzynki.', 404);
                if (mailbox.statusCode !== 'PENDING') throw new MailboxError('Ta skrzynka jest już założona.', 409);
                current = mailbox;
                try {
                    await DirectAdminGateway.create(mailbox.address, crypto.randomBytes(24).toString('hex'));
                } catch (error) {
                    // Brama zwraca wyłącznie własne komunikaty, nigdy żądanie ani hasło.
                    const lastError = error instanceof Error ? error.message : 'Nie udało się połączyć z serwerem poczty.';
                    await this.repository.setState(id, 'PENDING', lastError, conn);
                    return { ...mailbox, lastError };
                }
                createdAddress = mailbox.address;
                await this.repository.setState(id, 'ACTIVE', null, conn);
                return { ...mailbox, statusCode: 'ACTIVE', lastError: null };
            });
        } catch (error) {
            if (createdAddress) {
                const message = `Osierocona skrzynka do ręcznego podpięcia: ${createdAddress}. Serwer poczty założył skrzynkę, ale zapis stanu w PS nie powiódł się. Nie zakładaj jej ponownie.`;
                await this.report(message);
                return { ...current!, statusCode: 'PENDING', lastError: message };
            }
            throw error;
        }
    }

    private static async report(message: string): Promise<void> {
        console.error(message);
        try { await ToolsMail.sendServerErrorReport(new Error(message)); }
        catch { console.error('Nie udało się wysłać zgłoszenia o błędzie skrzynki.'); }
    }

    static async assertAccess(id: number, user?: UserData): Promise<MailboxRecord> {
        const mailbox = await this.repository.get(id);
        if (!mailbox) throw new MailboxError('Nie znaleziono skrzynki.', 404);
        if (await SbAccessController.canManage(user)) return mailbox;
        if (!user?.enviId) throw new MailboxError('Zaloguj się, aby zarządzać skrzynką.', 403);
        if (mailbox.createdByPersonId === user.enviId) return mailbox;
        const sb = new SbAccessRepository();
        const account = await sb.getPersonAccount(user.enviId);
        if (!account?.isActive) throw new MailboxError('Brak uprawnień do tej skrzynki.', 403);
        const record = await sb.getByPersonId(user.enviId);
        const rows = await this.repository.findWithAssignees(true);
        if (!personMailboxes(user.enviId, rows, record?.levels.mail ?? []).some(m => m.code === mailbox.code))
            throw new MailboxError('Brak uprawnień do tej skrzynki.', 403);
        return mailbox;
    }

    /** Jedyne API, które otrzymuje hasło; nie zapisujemy go nawet na czas zadania. */
    static async password(id: number): Promise<{ password: string }> {
        return ToolsDb.transaction(async (conn) => {
            const mailbox = await this.repository.get(id, conn, true);
            if (!mailbox) throw new MailboxError('Nie znaleziono skrzynki.', 404);
            if (mailbox.statusCode !== 'ACTIVE') throw new MailboxError('Najpierw załóż skrzynkę przyciskiem „Ponów”.', 409);
            const password = crypto.randomBytes(24).toString('hex');
            await DirectAdminGateway.changePassword(mailbox.address, password);
            return { password };
        });
    }

    static async moveToProject(id: number): Promise<MailboxRecord> {
        try {
            return await ToolsDb.transaction(async (conn) => {
                const mailbox = await this.repository.get(id, conn, true);
                if (!mailbox) throw new MailboxError('Nie znaleziono skrzynki.', 404);
                if (!mailbox.contractId) throw new MailboxError('Ta skrzynka nie należy do kontraktu.', 409);
                const info = await this.repository.contract(mailbox.contractId, conn);
                if (!info) throw new MailboxError('Nie znaleziono projektu kontraktu.', 404);
                await this.repository.moveToProject(id, info.projectId, conn);
                return { ...mailbox, contractId: null, projectId: info.projectId };
            });
        } catch (error) {
            if ((error as any)?.code === 'ER_DUP_ENTRY') throw new MailboxError('Projekt ma już swoją skrzynkę.', 409);
            throw error;
        }
    }

    static async list(projectId?: number, contractId?: number): Promise<MailboxRecord[]> {
        const all = await this.repository.find();
        if (contractId) {
            const info = await this.repository.contract(contractId);
            if (!info) throw new MailboxError('Nie znaleziono kontraktu.', 404);
            return all.filter(m => m.contractId === contractId || m.projectId === info.projectId);
        }
        return all.filter(m => m.projectId === projectId);
    }
}
