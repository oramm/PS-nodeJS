import crypto from 'crypto';
import ChatSpaceValidator, { ChatSpaceError } from './ChatSpaceValidator';
export { ChatSpaceError } from './ChatSpaceValidator';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import ToolsChat, { ChatMemberResult } from '../../setup/Sessions/ToolsChat';
import ProjectAssignmentRepository from '../../persons/projectAssignments/ProjectAssignmentRepository';
import {
    contractMemberIds,
    MembershipEdge,
    projectMemberIds,
} from '../../persons/projectAssignments/projectMembership';
import { PROJECT_SCOPED_ROLES } from '../../setup/Sessions/projectScopedPolicy';
import { NO_PROJECT_MAIL_ROLES } from '../../mailboxes/mailboxAccessPolicy';
import ToolsMail from '../../tools/ToolsMail';
import { SystemRoleName } from '../../types/sessionTypes';
import ChatSpaceRepository, {
    ChatSpaceRecord,
    ContractChatInfo,
    SpaceContractRow,
} from './ChatSpaceRepository';

export const CHAT_SPACE_NAME_MAX = 128;

export type ChatSpaceScope = 'contract' | 'project';

/** Wybór z formularza tworzenia kontraktu (`_chatSpaceSelection`). Brak pola = none. */
export type ChatSpaceSelection =
    | { mode: 'none' }
    | { mode: 'new'; scope: ChatSpaceScope; displayName?: string; personIds?: number[] }
    | { mode: 'existing'; chatSpaceId: number };

export type CreateChatSpaceResult = {
    chatSpace: ChatSpaceRecord;
    /** Wynik per osoba. INVITED = zaproszenie wysłane (sukces), FAILED nie wywraca operacji. */
    members: ChatMemberResult[];
};

/**
 * Skład pokoju według reguły projectMembership: pokój projektu = osoby projektu, a każdy podpięty kontrakt
 * dokłada swoje. Zakładający zostaje w składzie (był w nim od założenia), żeby wyrównanie go nie usuwało.
 */
export function spaceMemberIds(rows: SpaceContractRow[], edges: MembershipEdge[]): number[] {
    const projectOurId = rows[0]?.spaceProjectOurId;
    const createdBy = rows[0]?.createdByPersonId;
    return [...new Set([
        ...(createdBy ? [createdBy] : []),
        ...(projectOurId ? projectMemberIds(edges, projectOurId) : []),
        ...rows.flatMap((row) => row.contractId && row.contractProjectOurId
            ? contractMemberIds(edges, row.contractId, row.contractProjectOurId) : []),
    ])];
}

export type MemberSnapshot = Map<number, { googleName: string; personIds: number[] }>;

/** Kto doszedł i kto wypadł z pokoju między dwoma odczytami reguły (pokoje z odczytu "przed"). */
export function memberChanges(before: MemberSnapshot, after: MemberSnapshot) {
    return [...before].map(([spaceId, old]) => {
        const now = after.get(spaceId)?.personIds ?? [];
        return {
            spaceId,
            googleName: old.googleName,
            add: now.filter((id) => !old.personIds.includes(id)),
            remove: old.personIds.filter((id) => !now.includes(id)),
        };
    }).filter((change) => change.add.length || change.remove.length);
}

/**
 * Lokalna kopia bazy ma prawdziwe adresy i pokoje: poza produkcją wyrównanie składu nie woła Google.
 * Furtka lokalna jak dla zadań w tle (index.ts): CHAT_MEMBER_SYNC=true.
 */
/** Pracownik kontraktowy i klient nie dostają pokoju z przypisania - ta sama granica co poczta (MBX). */
const roomFromAssignment = (role?: string | null) => !NO_PROJECT_MAIL_ROLES.includes(role as SystemRoleName);

function memberSyncEnabled(): boolean {
    return (process.env.NODE_ENV || 'production') === 'production' || process.env.CHAT_MEMBER_SYNC === 'true';
}

/**
 * Pokoje Google Chat umów ENVI. Kolejność przy tworzeniu: najpierw Google, potem baza
 * (przy błędzie bazy osierocony pokój trafia do logu błędów z nazwą `spaces/...`).
 * Skład wyrównuje withMemberSync po każdej zmianie przypisań (DOSTEP-2); bez outboxa.
 */
export default class ChatSpacesController {
    private static repository = new ChatSpaceRepository();

    /** Nazwa domyślna pokoju; własna nazwa użytkownika ma pierwszeństwo. Zawsze max 128 znaków. */
    static makeDisplayName(
        info: ContractChatInfo,
        scope: ChatSpaceScope,
        custom?: string
    ): string {
        const own = (custom ?? '').trim();
        if (own) return own.slice(0, CHAT_SPACE_NAME_MAX);
        const label =
            scope === 'project'
                ? `${info.projectOurId} ${
                      (info.projectAlias || '').trim() ||
                      info.projectName.trim()
                  }`
                : `${info.ourId} ${(info.alias || '').trim() || info.name.trim()}`;
        return label.trim().slice(0, CHAT_SPACE_NAME_MAX);
    }

    /**
     * Osoby kontraktu (pokój projektu: osoby projektu) według reguły projectMembership, bez pracownika
     * kontraktowego i klienta, + osoba wywołująca.
     */
    static async resolveMemberEmails(
        info: ContractChatInfo,
        actorPersonId?: number | null,
        scope: ChatSpaceScope = 'contract'
    ): Promise<string[]> {
        const edges = await ProjectAssignmentRepository.findMembership({ projectOurIds: [info.projectOurId] });
        const ids = [
            ...(scope === 'project'
                ? projectMemberIds(edges, info.projectOurId)
                : contractMemberIds(edges, info.id, info.projectOurId)),
            ...(actorPersonId ? [actorPersonId] : []),
        ];
        const rows = await this.repository.getGoogleEmails(ids);
        const seen = new Set<string>();
        const emails: string[] = [];
        for (const row of rows) {
            if (row.personId !== actorPersonId && !roomFromAssignment(row.systemRoleName)) continue;
            const email = (row.email || '').trim();
            if (!email || seen.has(email.toLowerCase())) continue;
            seen.add(email.toLowerCase());
            emails.push(email);
        }
        return emails;
    }

    private static async requireOurContract(
        contractId: number,
        conn?: mysql.PoolConnection
    ): Promise<ContractChatInfo> {
        if (!Number.isInteger(contractId) || contractId <= 0)
            throw new ChatSpaceError(
                'Brak wymaganego parametru: id kontraktu',
                400
            );
        const info = await this.repository.getContractInfo(contractId, conn);
        if (!info)
            throw new ChatSpaceError(
                'Nie znaleziono kontraktu o podanym Id',
                404
            );
        if (!info.isOur)
            throw new ChatSpaceError(
                'Pokój Google Chat można założyć tylko dla kontraktu ENVI',
                409
            );
        return info;
    }

    /** Lista z bazy (nie z Google): najpierw pokoje projektu kontraktu, potem reszta. */
    static async list(contractId: number) {
        const info = await this.requireOurContract(contractId);
        const spaces = await this.repository.listSpaces(info.projectOurId);
        return spaces.map((space) => ({
            ...space,
            isOfContractProject: space.projectOurId === info.projectOurId,
            isAttachedToContract: space.id === info.chatSpaceId,
        }));
    }

    /** Lista dla ekranu nowego kontraktu (jeszcze bez id): pokoje wskazanego projektu pierwsze; brak projektu = wszystkie. */
    static async listForProject(projectOurId?: string) {
        const project = (projectOurId ?? '').trim() || undefined;
        const spaces = await this.repository.listSpaces(project);
        return spaces.map((space) => ({
            ...space,
            isOfContractProject:
                !!project && space.projectOurId === project,
            isAttachedToContract: false,
        }));
    }

    /**
     * Zakłada pokój w Google i zapisuje go w bazie razem z podpięciem do kontraktu.
     * `memberEmailsOverride` (tylko skrypty testowe) pomija wyliczanie członków z kontraktu.
     */
    static async createForContract(
        contractId: number,
        options: {
            scope: ChatSpaceScope;
            displayName?: string;
            actorPersonId?: number | null;
            personIds?: unknown;
            memberEmailsOverride?: string[];
        }
    ): Promise<CreateChatSpaceResult> {
        if (options.scope !== 'contract' && options.scope !== 'project')
            throw new ChatSpaceError(
                "Zakres pokoju: 'contract' albo 'project'",
                400
            );
        const info = await this.requireOurContract(contractId);
        if (info.chatSpaceId)
            throw new ChatSpaceError(
                'Kontrakt ma już pokój Google Chat. Najpierw go odepnij.',
                409
            );

        const displayName = this.makeDisplayName(
            info,
            options.scope,
            options.displayName
        );
        const selectedIds = ChatSpaceValidator.personIds(options.personIds ?? []);
        const selected = await this.repository.getGoogleEmails(selectedIds);
        if (selected.length !== selectedIds.length)
            throw new ChatSpaceError('Nie znaleziono wszystkich wybranych osób.', 400);
        const unavailable = selected.filter(person => !person.email);
        if (unavailable.length)
            throw new ChatSpaceError(`Brak aktywnego konta Google w PS: ${unavailable.map(person => person.displayName).join(', ')}.`, 400);
        const defaultEmails =
            options.memberEmailsOverride ??
            (await this.resolveMemberEmails(info, options.actorPersonId, options.scope));
        const emails = [...new Set([...defaultEmails, ...selected.map(person => person.email!)].map(email => email.toLowerCase()))];

        let google;
        try {
            google = await ToolsChat.createSpaceWithMembers(
                displayName,
                emails,
                crypto.randomUUID()
            );
        } catch (e) {
            throw new ChatSpaceError(
                `Google Chat nie założył pokoju: ${
                    e instanceof Error ? e.message : String(e)
                }`,
                502
            );
        }

        try {
            const chatSpaceId = await ToolsDb.transaction<number>(
                async (conn) => {
                    const id = await this.repository.addSpace(
                        {
                            googleName: google.name,
                            displayName: google.displayName || displayName,
                            uri: google.uri || null,
                            projectOurId:
                                options.scope === 'project'
                                    ? info.projectOurId
                                    : null,
                            createdByPersonId: options.actorPersonId ?? null,
                        },
                        conn
                    );
                    const changed = await this.repository.setContractSpace(
                        contractId,
                        id,
                        conn,
                        true
                    );
                    if (!changed)
                        throw new ChatSpaceError(
                            'Kontrakt dostał w międzyczasie inny pokój.',
                            409
                        );
                    return id;
                }
            );
            const chatSpace = (await this.repository.findSpaceById(
                chatSpaceId
            ))!;
            return { chatSpace, members: google.members };
        } catch (e) {
            // Pokój istnieje w Google, a bazy nie udało się zapisać: nazwa idzie do logu błędu.
            console.error(
                `[ChatSpaces] OSIEROCONY POKOJ ${google.name} (${displayName}) - kontrakt ${contractId}, zapis w bazie nie powiodl sie:`,
                e
            );
            throw e;
        }
    }

    /** Zewnetrzne konta Gmail nie moga zapraszac z interfejsu Google Chat. */
    static async inviteMembers(contractId: number, personIds: unknown, actorPersonId?: number | null) {
        const ids = ChatSpaceValidator.personIds(personIds);
        if (!ids.length) throw new ChatSpaceError('Wybierz osoby do zaproszenia.', 400);
        const info = await this.requireOurContract(contractId);
        if (!info.chatSpaceId)
            throw new ChatSpaceError('Kontrakt nie ma pokoju Google Chat.', 409);
        const space = await this.repository.findSpaceById(info.chatSpaceId);
        if (!space) throw new ChatSpaceError('Nie znaleziono pokoju.', 404);
        if (!actorPersonId)
            throw new ChatSpaceError('Nie ustalono osoby zapraszającej.', 403);
        const [actor] = await this.repository.getGoogleEmails([actorPersonId]);
        if (!actor?.email || !(await ToolsChat.hasJoinedMember(space.googleName, actor.email)))
            throw new ChatSpaceError('Zapraszać może tylko osoba należąca do tego pokoju.', 403);
        const persons = await this.repository.getGoogleEmails(ids);
        if (persons.length !== ids.length)
            throw new ChatSpaceError('Nie znaleziono wszystkich wybranych osób.', 400);
        const emails = [...new Set(persons.filter(p => p.email).map(p => p.email!.toLowerCase()))];
        const results = emails.length ? await ToolsChat.inviteMembers(space.googleName, emails) : [];
        return { members: persons.map(person => ({
            personId: person.personId,
            displayName: person.displayName,
            ...(results.find(result => result.email === person.email?.toLowerCase()) ?? {
                email: person.email || '', state: 'FAILED', error: 'Brak aktywnego konta Google w PS.',
            }),
        })) };
    }

    /** Podpina kontrakt do istniejącego wiersza ChatSpaces. Kontrakt z innym pokojem: odmowa (najpierw odepnij). */
    static async attach(
        contractId: number,
        chatSpaceId: number
    ): Promise<ChatSpaceRecord> {
        const info = await this.requireOurContract(contractId);
        if (!Number.isInteger(chatSpaceId) || chatSpaceId <= 0)
            throw new ChatSpaceError(
                'Brak wymaganego parametru: chatSpaceId',
                400
            );
        const space = await this.repository.findSpaceById(chatSpaceId);
        if (!space)
            throw new ChatSpaceError('Nie znaleziono pokoju o podanym Id', 404);
        if (info.chatSpaceId === chatSpaceId) return space; // idempotentnie
        if (info.chatSpaceId)
            throw new ChatSpaceError(
                'Kontrakt ma już pokój Google Chat. Najpierw go odepnij.',
                409
            );
        // Pokój dostaje osoby podpinanego kontraktu.
        await this.withMemberSync([info.projectOurId], () => ToolsDb.transaction(async (conn) => {
            const changed = await this.repository.setContractSpace(
                contractId,
                chatSpaceId,
                conn,
                true
            );
            if (!changed)
                throw new ChatSpaceError(
                    'Kontrakt dostał w międzyczasie inny pokój.',
                    409
                );
        }), [chatSpaceId]);
        return space;
    }

    /**
     * Wykonuje zmianę przypisań i wyrównuje skład pokoi projektów (oraz wskazanych pokoi): kto doszedł
     * do reguły, dostaje zaproszenie; kto wypadł - wychodzi z pokoju, ale tylko rola ograniczona
     * (dla niej przypisanie jest granicą, D4). Pracownik ENVI nie traci pokoju, a osoby spoza reguły
     * (zaproszone ręcznie) zostają. Pracownik kontraktowy i klient nie są ani zapraszani, ani usuwani
     * (pokój nie wynika dla nich z przypisania). Błąd Chatu nie cofa zmiany - idzie do zgłoszeń błędów.
     * Przeniesienie kontraktu do innego projektu: wołający podaje stary i nowy projekt.
     * shortcut: edycja kontraktu podaje tylko projekt z formularza; gdyby edycja zmieniała projekt, stary
     * projekt nie jest wyrównany - przeniesienie idzie przez moveToProject, które podaje oba.
     */
    static async withMemberSync<T>(
        projectOurIds: (string | null | undefined)[],
        work: () => Promise<T>,
        spaceIds: number[] = []
    ): Promise<T> {
        const projects = [...new Set(projectOurIds.filter((id): id is string => !!id))];
        if (!memberSyncEnabled() || (!projects.length && !spaceIds.length)) return work();
        let before: MemberSnapshot | undefined;
        try {
            before = await this.memberSnapshot(projects, spaceIds);
        } catch (e) {
            await this.report(`Nie odczytano składu pokoi przed zmianą przypisań - pokoje bez wyrównania: ${e instanceof Error ? e.message : String(e)}`);
        }
        const result = await work();
        if (before?.size) await this.syncMembers(projects, before);
        return result;
    }

    private static async memberSnapshot(projectOurIds: string[], spaceIds: number[]): Promise<MemberSnapshot> {
        const rows = await this.repository.spacesWithContracts(projectOurIds, spaceIds);
        const involved = [...new Set(rows.flatMap((row) => [row.spaceProjectOurId, row.contractProjectOurId])
            .filter((id): id is string => !!id))];
        const edges = await ProjectAssignmentRepository.findMembership({ projectOurIds: involved });
        const snapshot: MemberSnapshot = new Map();
        for (const spaceId of new Set(rows.map((row) => row.spaceId))) {
            const spaceRows = rows.filter((row) => row.spaceId === spaceId);
            snapshot.set(spaceId, { googleName: spaceRows[0].googleName, personIds: spaceMemberIds(spaceRows, edges) });
        }
        return snapshot;
    }

    /** Nigdy nie rzuca: przypisania są już zapisane. */
    private static async syncMembers(projectOurIds: string[], before: MemberSnapshot): Promise<void> {
        try {
            const changes = memberChanges(before, await this.memberSnapshot(projectOurIds, [...before.keys()]));
            const ids = [...new Set(changes.flatMap((change) => [...change.add, ...change.remove]))];
            if (!ids.length) return;
            // Także konto nieaktywne: usunięcie z pokoju nie może zależeć od aktywności konta.
            const persons = new Map((await this.repository.getGoogleEmails(ids, true)).map((p) => [p.personId, p]));
            const emailOf = (id: number) => persons.get(id)?.email?.toLowerCase();
            const failures: string[] = [];
            for (const change of changes) {
                const add = [...new Set(change.add
                    .filter((id) => persons.get(id)?.isActive && roomFromAssignment(persons.get(id)?.systemRoleName))
                    .map(emailOf).filter((email): email is string => !!email))];
                const invited = add.length ? await ToolsChat.inviteMembers(change.googleName, add) : [];
                for (const failed of invited.filter((result) => result.state === 'FAILED'))
                    failures.push(`${change.googleName}: nie dodano ${failed.email}: ${failed.error}`);
                for (const id of change.remove) {
                    const email = emailOf(id);
                    const role = persons.get(id)?.systemRoleName;
                    if (!email || !roomFromAssignment(role) || !PROJECT_SCOPED_ROLES.includes(role as SystemRoleName)) continue;
                    try {
                        await ToolsChat.removeMember(change.googleName, email);
                    } catch (e) {
                        failures.push(`${change.googleName}: nie usunięto ${email}: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }
            if (failures.length) await this.report(failures.join('\n'));
        } catch (e) {
            await this.report(`Wyrównanie składu pokoi po zmianie przypisań nie powiodło się: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Wzorzec MailboxController.report: log + zgłoszenie błędu serwera; samo zgłoszenie też nie rzuca. */
    private static async report(details: string): Promise<void> {
        const message = `[ChatSpaces] Wyrównanie składu pokoi Google Chat - do poprawy ręcznie:\n${details}`;
        console.error(message);
        try { await ToolsMail.sendServerErrorReport(new Error(message)); }
        catch { console.error('[ChatSpaces] Nie udało się wysłać zgłoszenia o błędzie wyrównania pokoi.'); }
    }

    /** Odpina kontrakt (ChatSpaceId = NULL). Wiersz ChatSpaces i pokój w Google zostają. */
    static async detach(contractId: number): Promise<void> {
        const info = await this.requireOurContract(contractId);
        if (!info.chatSpaceId)
            throw new ChatSpaceError(
                'Kontrakt nie ma przypiętego pokoju.',
                409
            );
        // Pokój traci osoby odpinanego kontraktu (współpracownik wychodzi, jeśli nie trzyma go nic innego).
        await this.withMemberSync([info.projectOurId], () => ToolsDb.transaction(async (conn) => {
            await this.repository.setContractSpace(contractId, null, conn);
        }), [info.chatSpaceId]);
    }

    static parseSelection(raw: unknown): ChatSpaceSelection {
        const none: ChatSpaceSelection = { mode: 'none' };
        if (!raw || typeof raw !== 'object') return none;
        const value = raw as Record<string, unknown>;
        if (value.mode === 'new') {
            if (value.scope !== 'contract' && value.scope !== 'project')
                return none;
            let personIds: number[] | undefined;
            try {
                if (value.personIds !== undefined)
                    personIds = ChatSpaceValidator.personIds(value.personIds);
            } catch {
                return none;
            }
            return {
                mode: 'new',
                scope: value.scope,
                ...(personIds !== undefined ? { personIds } : {}),
                displayName:
                    typeof value.displayName === 'string' &&
                    value.displayName.trim()
                        ? value.displayName.trim().slice(0, CHAT_SPACE_NAME_MAX)
                        : undefined,
            };
        }
        if (value.mode === 'existing') {
            const id = Number(value.chatSpaceId);
            return Number.isInteger(id) && id > 0
                ? { mode: 'existing', chatSpaceId: id }
                : none;
        }
        return none;
    }

    /**
     * Wołane PO commicie transakcji nowego kontraktu. NIGDY nie rzuca: błąd Chatu
     * zwraca w polu `error` (wołający loguje i zgłasza), a kontrakt zostaje.
     */
    static async provisionAfterContractCreation(
        contractId: number,
        selection: ChatSpaceSelection,
        actorPersonId?: number | null
    ): Promise<{ chatSpaceId?: number; error?: unknown }> {
        try {
            if (selection.mode === 'none') return {};
            if (selection.mode === 'existing') {
                const space = await this.attach(
                    contractId,
                    selection.chatSpaceId
                );
                return { chatSpaceId: space.id };
            }
            const result = await this.createForContract(contractId, {
                scope: selection.scope,
                displayName: selection.displayName,
                personIds: selection.personIds,
                actorPersonId,
            });
            return { chatSpaceId: result.chatSpace.id };
        } catch (error) {
            return { error };
        }
    }
}
