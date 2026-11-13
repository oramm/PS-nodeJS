import crypto from 'crypto';
import ChatSpaceValidator, { ChatSpaceError } from './ChatSpaceValidator';
export { ChatSpaceError } from './ChatSpaceValidator';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { contractAssigneeIds } from '../contractAssignees';
import ToolsChat, { ChatMemberResult } from '../../setup/Sessions/ToolsChat';
import ChatSpaceRepository, {
    ChatSpaceRecord,
    ContractChatInfo,
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
 * Pokoje Google Chat umów ENVI. Kolejność przy tworzeniu: najpierw Google, potem baza
 * (przy błędzie bazy osierocony pokój trafia do logu błędów z nazwą `spaces/...`).
 * Bez outboxa i bez synchronizacji członków po utworzeniu pokoju.
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

    /** Kierownik + administrator umowy + osoba wywołująca; bez pustych i duplikatów. */
    static async resolveMemberEmails(
        info: ContractChatInfo,
        actorPersonId?: number | null
    ): Promise<string[]> {
        const ids = contractAssigneeIds(info.managerId, info.adminId, actorPersonId);
        const rows = await this.repository.getGoogleEmails(ids);
        const seen = new Set<string>();
        const emails: string[] = [];
        for (const row of rows) {
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
            (await this.resolveMemberEmails(info, options.actorPersonId));
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
        await ToolsDb.transaction(async (conn) => {
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
        });
        return space;
    }

    /** Odpina kontrakt (ChatSpaceId = NULL). Wiersz ChatSpaces i pokój w Google zostają. */
    static async detach(contractId: number): Promise<void> {
        const info = await this.requireOurContract(contractId);
        if (!info.chatSpaceId)
            throw new ChatSpaceError(
                'Kontrakt nie ma przypiętego pokoju.',
                409
            );
        await ToolsDb.transaction(async (conn) => {
            await this.repository.setContractSpace(contractId, null, conn);
        });
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
