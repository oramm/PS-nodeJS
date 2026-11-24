import { createHmac } from 'crypto';
import ToolsDb from '../tools/ToolsDb';
import SbAccessRepository from '../sbAccess/SbAccessRepository';
import SbAccessSecretRepository from '../sbAccess/SbAccessSecretRepository';
import { encryptForComputer, mailboxSecretName } from '../sbAccess/sbSecretsPolicy';
import { SbAccessRecord } from '../sbAccess/sbAccessTypes';
import MailboxRepository, { MailboxHolderRow, MailboxRecord } from './MailboxRepository';
import DirectAdminGateway from './directAdminGateway';
import { MailboxAssigneeRow, personMailboxes } from './mailboxAccessPolicy';
import MailboxController, { MailboxError } from './MailboxController';
import SbAccessEventRepository from '../sbAccess/SbAccessEventRepository';

/** Krótszy sekret dałoby się odgadnąć z jednego wycieku hasła skrzynki. */
const MIN_SECRET_LENGTH = 32;
const secret = () => process.env.MAILBOX_PASSWORD_SECRET?.trim() ?? '';

/** Brak sekretu = PS nie zarządza hasłami: nowa skrzynka dostaje losowe hasło i kopię dla agenta, jak przed SKO. */
export const passwordsManaged = () => secret().length >= MIN_SECRET_LENGTH;

/** Hasło skrzynki zarządzanej: HMAC-SHA256(sekret serwera, "kod:wersja"), 48 znaków hex. */
export function mailboxPassword(code: string, version: number): string {
    if (!passwordsManaged()) throw new Error('Hasła skrzynek nie są skonfigurowane na serwerze PS.');
    return createHmac('sha256', secret()).update(`${code}:${version}`).digest('hex').slice(0, 48);
}

/** Skrzynki zarządzane, których posiadacz bieżącej wersji hasła już nie ma do nich prawa (reguła personMailboxes). */
export function staleMailboxes(holders: MailboxHolderRow[], rows: MailboxAssigneeRow[], registry: MailboxRecord[]): MailboxRecord[] {
    const codesOf = new Map<number, Set<string>>();
    const stale = new Map<number, MailboxRecord>();
    for (const holder of holders) {
        const mailbox = registry.find((m) => m.id === holder.mailboxId);
        if (mailbox?.passwordVersion == null || holder.version !== mailbox.passwordVersion) continue;
        if (!codesOf.has(holder.personId)) codesOf.set(holder.personId, new Set(
            holder.isActive && (holder.statusCode === 'INVITED' || holder.statusCode === 'ACTIVE')
                ? personMailboxes(holder.personId, rows, holder.manualCodes, holder.systemRoleName).map((m) => m.code)
                : []));
        if (!codesOf.get(holder.personId)!.has(mailbox.code)) stale.set(mailbox.id!, mailbox);
    }
    return [...stale.values()];
}

export type RotationFailure = { address: string; error: string };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Nie udało się zmienić hasła skrzynki.';

/** Niezmienione hasło po utracie dostępu nie może zginąć po cichu: log i zgłoszenie (adresy i komunikaty bramki, bez haseł). */
async function reportFailures(failed: RotationFailure[], when: string): Promise<void> {
    if (failed.length) await MailboxController.report(`[SKO] Nie zmieniono hasła skrzynek przy ${when}: ${
        failed.map((f) => `${f.address} (${f.error})`).join('; ')}. Ponów „Zmień hasło” przy skrzynce.`);
}

/**
 * Hasła skrzynek zarządzanych przez PS (plan SKO, K2'): wydanie komputerom, zmiana i uzgodnienie posiadaczy.
 * Jawne hasło żyje tylko w pamięci tych funkcji; zapis do bazy wyłącznie jako szyfrogram (SbAccessSecretRepository bez logu).
 */
export default class MailboxPasswordService {
    private static repository = new MailboxRepository();
    private static secrets = new SbAccessSecretRepository();
    private static sb = new SbAccessRepository();
    private static events = new SbAccessEventRepository();

    /** Wydaje komputerowi osoby hasła skrzynek zarządzanych, których nie ma albo ma w starszej wersji. Wołane z pobrania haseł. */
    static async issue(record: SbAccessRecord): Promise<void> {
        if (!passwordsManaged() || !record.publicKeyJwk) return;
        const [account, rows, registry, given, holders] = await Promise.all([
            this.sb.getPersonAccount(record.personId),
            this.repository.findWithAssignees(),
            this.repository.find(),
            this.secrets.listByPersonId(record.personId),
            this.repository.holderVersions(record.personId),
        ]);
        const mine = new Set(personMailboxes(record.personId, rows, record.levels.mail, account?.systemRoleName).map((m) => m.code));
        const names = new Set(given.map((secret) => secret.name));
        const issued: string[] = [];
        for (const mailbox of registry) {
            if (mailbox.passwordVersion == null || mailbox.statusCode !== 'ACTIVE' || !mine.has(mailbox.code)) continue;
            const name = mailboxSecretName(mailbox.code);
            if (names.has(name) && holders.get(mailbox.id!) === mailbox.passwordVersion) continue;
            const done = await ToolsDb.transaction<boolean>(async (conn) => {
                // Klucz i wersja pod blokadą: równoległa zmiana klucza albo hasła nie zostawi szyfrogramu nie do użycia.
                const person = await this.sb.getByPersonId(record.personId, conn, true);
                const current = await this.repository.get(mailbox.id!, conn, true);
                if (!person?.publicKeyJwk || (person.statusCode !== 'INVITED' && person.statusCode !== 'ACTIVE')
                    || current?.passwordVersion == null) return false;
                const ciphertext = encryptForComputer(person.publicKeyJwk, mailboxPassword(current.code, current.passwordVersion));
                await this.secrets.upsert(conn, record.personId, name, ciphertext, null);
                await this.repository.setHolder(conn, current.id!, record.personId, current.passwordVersion);
                return true;
            });
            if (done) issued.push(mailbox.code);
        }
        // Jeden wpis w historii Dostępów SB na pobranie (np. po zmianie klucza komputera); requestedBy null = system.
        if (issued.length) await ToolsDb.transaction((conn) => this.events.append(conn, {
            personId: record.personId, actionCode: 'GIVE_SECRET', resultCode: 'OK', requestedByPersonId: null,
            note: `PS wydał komputerowi hasła skrzynek (${issued.length}): ${issued.join(', ')}.`,
        }));
    }

    /**
     * Przejęcie hasła skrzynki przez PS (SKO-4: chocianow.ik@, biuro@); skrzynka już zarządzana = 409, bez drugiej zmiany.
     * Ogólnofirmowa skrzynka wskazanych osób (faktury@) zostaje z hasłem ręcznym (K3).
     */
    static async takeOver(mailboxId: number): Promise<MailboxRecord> {
        if (!passwordsManaged()) throw new MailboxError('Hasła skrzynek nie są skonfigurowane na serwerze PS.', 409);
        const mailbox = await this.repository.get(mailboxId);
        if (!mailbox) throw new MailboxError('Nie znaleziono skrzynki.', 404);
        if (mailbox.passwordVersion != null) throw new MailboxError('Hasło tej skrzynki PS już wydaje sam.', 409);
        if (mailbox.projectId == null && mailbox.contractId == null && !mailbox.allEmployees)
            throw new MailboxError('Skrzynka wskazanych osób zostaje z hasłem ręcznym - PS jej nie przejmuje.', 409);
        return this.rotate(mailboxId, null);
    }

    /**
     * Zmiana hasła skrzynki: wersja + 1 (NULL -> 1 = przejęcie skrzynki przez PS). Niepowodzenie serwera poczty = nic się nie zmienia.
     * `expectedVersion` podany i już nieaktualny = ktoś zmienił hasło w międzyczasie, bez drugiej zmiany.
     */
    static async rotate(mailboxId: number, expectedVersion?: number | null): Promise<MailboxRecord> {
        const rotated = await ToolsDb.transaction<MailboxRecord | null>(async (conn) => {
            const mailbox = await this.repository.get(mailboxId, conn, true);
            if (!mailbox) throw new MailboxError('Nie znaleziono skrzynki.', 404);
            if (mailbox.statusCode !== 'ACTIVE') throw new MailboxError('Najpierw załóż skrzynkę przyciskiem „Ponów”.', 409);
            if (expectedVersion !== undefined && (mailbox.passwordVersion ?? null) !== expectedVersion) return null;
            const version = (mailbox.passwordVersion ?? 0) + 1;
            // Hasło wynika z wersji: gdy zapis niżej padnie po zmianie na serwerze, ponowienie ustawi to samo hasło.
            await DirectAdminGateway.changePassword(mailbox.address, mailboxPassword(mailbox.code, version));
            await this.repository.setPasswordVersion(mailboxId, version, conn);
            await this.secrets.removeByName(conn, mailboxSecretName(mailbox.code));
            return { ...mailbox, passwordVersion: version };
        });
        if (!rotated) return (await this.repository.get(mailboxId))!;
        return rotated.agentCopyStatus === 'SET' ? this.dropAgentCopy(rotated) : rotated;
    }

    /**
     * Po zmianie hasła agent loguje się wprost, więc kopia na konto techniczne jest zbędna (K0); jej błąd nie cofa zmiany hasła.
     * Ponowienie po błędzie: trasa agentCopy skrzynki zarządzanej.
     */
    static async dropAgentCopy(mailbox: MailboxRecord): Promise<MailboxRecord> {
        let agentCopyLastError: string | null = null;
        try { await DirectAdminGateway.removeAgentCopy(mailbox.address); }
        catch (error) { agentCopyLastError = errorMessage(error); }
        const agentCopyStatus = agentCopyLastError === null ? 'NONE' : 'SET';
        await ToolsDb.transaction((conn) => this.repository.setAgentCopyState(mailbox.id!, agentCopyStatus, agentCopyLastError, conn));
        return { ...mailbox, agentCopyStatus, agentCopyLastError };
    }

    /**
     * Zmienia hasło skrzynek, których posiadacz utracił dostęp (blokada SB, konto PS, rola, przypisanie, wyjątek ręczny).
     * Wołane w tle, bez budżetu czasu (SbAccessController); równoległe przebiegi nie zmieniają hasła dwa razy (`expectedVersion`).
     * shortcut: zmiana hasła dopiero przy następnym pobraniu haseł albo zmianie i otwarciu Dostępów SB; gdy zwłoka przestanie
     * wystarczać - uzgodnienie także po każdej zmianie przypisań.
     */
    static async reconcile(): Promise<{ rotated: string[]; failed: RotationFailure[] }> {
        if (!passwordsManaged()) return { rotated: [], failed: [] };
        const [holders, rows, registry] = await Promise.all([
            this.repository.holders(), this.repository.findWithAssignees(), this.repository.find(),
        ]);
        const result = { rotated: [] as string[], failed: [] as RotationFailure[] };
        for (const mailbox of staleMailboxes(holders, rows, registry)) {
            try { await this.rotate(mailbox.id!, mailbox.passwordVersion!); result.rotated.push(mailbox.address); }
            catch (error) { result.failed.push({ address: mailbox.address, error: errorMessage(error) }); }
        }
        await reportFailures(result.failed, 'uzgodnieniu dostępu');
        return result;
    }

    /**
     * "Zmień hasła wszystkich skrzynek zarządzanych" partiami: Heroku ucina żądanie po 30 s, więc wywołujący
     * powtarza z `afterId` z odpowiedzi, aż `remaining` = 0. Jedna zmiana to do 15 s na hasło (limit bramki) i drugie
     * tyle na zdjęcie kopii, gdy skrzynka ją jeszcze ma; ucięte żądanie nie przerywa zmiany, a ponowiona partia
     * zmieni takie hasło jeszcze raz (bez szkody).
     */
    static async rotateAll(afterId = 0, budgetMs = 10000): Promise<{ rotated: string[]; failed: RotationFailure[]; afterId: number; remaining: number }> {
        const queue = (await this.repository.find())
            .filter((m) => m.passwordVersion != null && m.statusCode === 'ACTIVE' && m.id! > afterId)
            .sort((a, b) => a.id! - b.id!);
        const result = { rotated: [] as string[], failed: [] as RotationFailure[], afterId, remaining: queue.length };
        const started = Date.now();
        for (const mailbox of queue) {
            if (Date.now() - started >= budgetMs) break;
            try { await this.rotate(mailbox.id!); result.rotated.push(mailbox.address); }
            catch (error) { result.failed.push({ address: mailbox.address, error: errorMessage(error) }); }
            result.afterId = mailbox.id!;
            result.remaining--;
        }
        await reportFailures(result.failed, 'zmianie haseł wszystkich skrzynek');
        return result;
    }
}
