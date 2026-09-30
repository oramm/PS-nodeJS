import ToolsDb from '../tools/ToolsDb';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import { AGENT_SYSTEM_EMAIL } from '../setup/Sessions/agentTokenAuth';
import { UserData } from '../types/sessionTypes';
import SbAccessRepository from './SbAccessRepository';
import SbAccessEventRepository from './SbAccessEventRepository';
import SbGithubGateway from './SbGithubGateway';
import SbDriveGateway from './SbDriveGateway';
import {
    NOT_CONFIGURED_MESSAGE,
    PartOutcome,
    SB_GITHUB_TOKEN_ENV,
    SB_INVITABLE_ROLES,
    SB_MANAGER_ROLES,
    SbAccessError,
    assertOperationAllowed,
    combineResult,
    sanitizeNote,
} from './sbAccessPolicy';
import {
    SB_ACCESS_ACTIONS,
    SB_ACCESS_RESULTS,
    SB_ACCESS_STATUSES,
    SbAccessAction,
    SbAccessOperationOutcome,
    SbAccessRecord,
    SbAccessStateInput,
    SbAccessStatus,
    SbAccessTransitionInput,
    SbPersonAccount,
} from './sbAccessTypes';

interface GithubPart extends PartOutcome {
    /** undefined = nie ruszaj zapamiętanego; null = wyczyść. */
    invitationId?: number | null;
    isMember?: boolean;
}

interface DrivePart extends PartOutcome {
    /** undefined = nie ruszaj zapamiętanego; null = wyczyść. */
    permissionId?: string | null;
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function sameText(a?: string | null, b?: string | null): boolean {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Zarządzanie dostępem do Second Brain: zaproszenie, blokada, odblokowanie, odebranie,
 * przypisanie konta GitHub.
 *
 * KOLEJNOŚĆ W KAŻDEJ OPERACJI: najpierw GitHub i Dysk, potem jeden zapis stanu + zdarzenia.
 * Obie części wykonują się niezależnie; wynik OK / PARTIAL / FAILED trafia do historii z uwagą,
 * co się udało, a co nie. FAILED nie zmienia stanu (nic się nie stało), PARTIAL zmienia stan
 * i zostawia zapamiętany identyfikator tego, czego nie zdjęto, żeby powtórka dokończyła.
 *
 * Brak tokenu GitHub przerywa operację PRZED jakimkolwiek wywołaniem zewnętrznym i bez zapisu.
 */
export default class SbAccessController {
    private static repository = new SbAccessRepository();
    private static events = new SbAccessEventRepository();

    static async recordTransition(
        input: SbAccessTransitionInput,
    ): Promise<void> {
        if (!Number.isInteger(input?.personId) || input.personId <= 0)
            throw new Error('Wymagany poprawny personId');
        if (!SB_ACCESS_ACTIONS.includes(input.actionCode))
            throw new Error('Nieznany kod czynności SB');
        if (!SB_ACCESS_RESULTS.includes(input.resultCode))
            throw new Error('Nieznany kod wyniku SB');
        if (input.state && !SB_ACCESS_STATUSES.includes(input.state.statusCode))
            throw new Error('Nieznany kod stanu SB');
        if (
            input.requestedByPersonId != null &&
            (!Number.isInteger(input.requestedByPersonId) ||
                input.requestedByPersonId <= 0)
        )
            throw new Error('Niepoprawny identyfikator zlecającego');

        await ToolsDb.transaction<void>(async (conn) => {
            if (input.state)
                await this.repository.upsertState(conn, {
                    ...input.state,
                    personId: input.personId,
                });
            await this.events.append(conn, {
                personId: input.personId,
                actionCode: input.actionCode,
                resultCode: input.resultCode,
                requestedByPersonId: input.requestedByPersonId,
                note: input.note,
            });
        });
    }

    static list() {
        return this.repository.list();
    }

    static getByPersonId(personId: number) {
        return this.repository.getByPersonId(personId);
    }

    static history(personId: number, limit?: number) {
        return this.events.listByPersonId(personId, limit);
    }

    /** Czy zalogowany zarządza dostępem do SB: rola z listy I znacznik przy osobie. */
    static async canManage(userData?: UserData | null): Promise<boolean> {
        if (!userData?.enviId) return false;
        if (!SB_MANAGER_ROLES.includes(userData.systemRoleName)) return false;
        return StaffMemberRepository.hasSbAccessManagement(userData.enviId);
    }

    /** Kogo można dziś zaprosić: role wg D2, bez wpisu albo z dostępem odebranym. */
    static async listInviteCandidates(): Promise<SbPersonAccount[]> {
        const candidates =
            await this.repository.listInviteCandidates(SB_INVITABLE_ROLES);
        return candidates.filter(
            (candidate) => !sameText(candidate.systemEmail, AGENT_SYSTEM_EMAIL),
        );
    }

    /** Członkowie organizacji GitHub, których konta nie przypisano żadnej osobie. */
    static async listUnlinkedGithubMembers(): Promise<
        { login: string; profileUrl: string }[]
    > {
        const github = this.github();
        const [logins, records] = await Promise.all([
            github.listMemberLogins(),
            this.repository.list(),
        ]);
        const linked = new Set(
            records
                .map((record) => record.githubLogin?.toLowerCase())
                .filter(Boolean),
        );
        return logins
            .filter((login) => !linked.has(login.toLowerCase()))
            .map((login) => ({
                login,
                profileUrl: `https://github.com/${login}`,
            }));
    }

    static async invite(
        personId: number,
        requestedByPersonId: number,
    ): Promise<SbAccessOperationOutcome> {
        const github = this.github();
        const account = await this.requireInvitableAccount(personId);
        const record = await this.repository.getByPersonId(personId);
        assertOperationAllowed(
            'INVITE',
            record?.statusCode ?? null,
            !!record?.isGrantedManually,
        );
        return this.grant(github, 'INVITE', account, record, requestedByPersonId);
    }

    static async unblock(
        personId: number,
        requestedByPersonId: number,
    ): Promise<SbAccessOperationOutcome> {
        const github = this.github();
        const record = await this.repository.getByPersonId(personId);
        assertOperationAllowed(
            'UNBLOCK',
            record?.statusCode ?? null,
            !!record?.isGrantedManually,
        );
        const account = await this.requireInvitableAccount(personId);
        return this.grant(github, 'UNBLOCK', account, record, requestedByPersonId);
    }

    static block(personId: number, requestedByPersonId: number) {
        return this.withdraw('BLOCK', 'BLOCKED', personId, requestedByPersonId);
    }

    static revoke(personId: number, requestedByPersonId: number) {
        return this.withdraw('REVOKE', 'REVOKED', personId, requestedByPersonId);
    }

    /**
     * Przypisanie konta GitHub do osoby, po sprawdzeniu w API, że konto jest członkiem
     * organizacji i nie jest przypisane nikomu innemu.
     *
     * AKTYWACJA (zaproszony -> aktywny) DZIEJE SIĘ TUTAJ, nie przy odczycie listy: tylko tu
     * wiadomo, które konto należy do osoby (zaproszenie po e-mailu nie zdradza, kto je przyjął),
     * a członkostwo i tak jest sprawdzane. Lista zostaje zwykłym odczytem bazy, bez wywołań
     * GitHuba i bez zapisów przy GET. Ponowne przypisanie tego samego konta = "sprawdź jeszcze
     * raz" (np. po odblokowaniu i przyjęciu nowego zaproszenia).
     *
     * `mode: 'self'` - osoba dla siebie (strona SB, B4): tylko własny wpis w stanie zaproszony
     * albo aktywny i bez podmiany już przypisanego innego konta. `mode: 'manager'` - kierownik
     * z uprawnieniem, także dla wpisu zablokowanego/odebranego (żeby dokończyć zdjęcie dostępu).
     */
    static async linkGithub(
        personId: number,
        requestedLogin: string,
        requestedByPersonId: number,
        mode: 'self' | 'manager',
    ): Promise<SbAccessOperationOutcome> {
        const github = this.github();
        const record = await this.repository.getByPersonId(personId);
        if (!record)
            throw new SbAccessError(
                409,
                mode === 'self'
                    ? 'Nie masz zaproszenia do SB - poproś przełożonego.'
                    : 'Osoba nie ma wpisu w rejestrze SB - najpierw ją zaproś.',
            );
        if (record.isGrantedManually)
            throw new SbAccessError(
                409,
                'Ten dostęp nadano ręcznie przed uruchomieniem modułu - moduł go nie zmienia.',
            );
        if (mode === 'self') {
            if (record.statusCode !== 'INVITED' && record.statusCode !== 'ACTIVE')
                throw new SbAccessError(
                    409,
                    'Twój dostęp do SB jest zablokowany albo odebrany - poproś przełożonego.',
                );
            if (record.githubLogin && !sameText(record.githubLogin, requestedLogin))
                throw new SbAccessError(
                    409,
                    `Masz już przypisane konto GitHub ${record.githubLogin}. Zmianę konta zleć przełożonemu.`,
                );
        }

        let membership;
        try {
            membership = await github.getMembership(requestedLogin);
        } catch (error) {
            const note = sanitizeNote(
                `Nie udało się sprawdzić konta GitHub ${requestedLogin}: ${errorText(error)}`,
            );
            await this.recordTransition({
                personId,
                actionCode: 'LINK_GITHUB',
                resultCode: 'FAILED',
                requestedByPersonId,
                note,
            });
            throw new SbAccessError(502, note);
        }
        if (!membership || membership.state !== 'active')
            throw new SbAccessError(
                422,
                `Konto GitHub ${requestedLogin} nie jest członkiem organizacji ENVI - najpierw trzeba przyjąć zaproszenie.`,
            );
        const login = membership.login;
        const owner = await this.repository.getByGithubLogin(login);
        if (owner && owner.personId !== personId)
            throw new SbAccessError(
                409,
                `Konto GitHub ${login} jest przypisane innej osobie.`,
            );

        const notes: string[] = [];
        if (!sameText(record.githubLogin, login)) {
            const note = record.githubLogin
                ? `Przypisano konto GitHub ${login} (zamiast ${record.githubLogin})`
                : `Przypisano konto GitHub ${login}`;
            try {
                await this.recordTransition({
                    personId,
                    actionCode: 'LINK_GITHUB',
                    resultCode: 'OK',
                    requestedByPersonId,
                    note,
                    state: { statusCode: record.statusCode, githubLogin: login },
                });
            } catch (error) {
                // Wyścig dwóch przypisań tego samego konta: UNIQUE na GithubLogin.
                if ((error as any)?.code === 'ER_DUP_ENTRY')
                    throw new SbAccessError(
                        409,
                        `Konto GitHub ${login} jest przypisane innej osobie.`,
                    );
                throw error;
            }
            notes.push(note);
        }
        if (record.statusCode === 'INVITED') {
            const note = `Konto GitHub ${login} jest członkiem organizacji - zaproszenie przyjęte`;
            await this.recordTransition({
                personId,
                actionCode: 'ACTIVATE',
                resultCode: 'OK',
                requestedByPersonId,
                note,
                state: { statusCode: 'ACTIVE' },
            });
            notes.push(note);
        }
        return {
            result: 'OK',
            note: notes.length ? notes.join('; ') : 'Bez zmian: konto już przypisane',
            state: await this.repository.getByPersonId(personId),
        };
    }

    // ---------------------------------------------------------------- wnętrze

    /** Token GitHub albo odmowa "funkcja nieskonfigurowana" - przed czymkolwiek innym. */
    private static github(): SbGithubGateway {
        const token = process.env[SB_GITHUB_TOKEN_ENV]?.trim();
        if (!token) throw new SbAccessError(503, NOT_CONFIGURED_MESSAGE);
        return new SbGithubGateway(token);
    }

    /** Konto, które wolno zaprosić: istnieje, aktywne, z adresem logowania, rola wg D2. */
    private static async requireInvitableAccount(
        personId: number,
    ): Promise<SbPersonAccount & { systemEmail: string }> {
        const account = await this.repository.getPersonAccount(personId);
        if (!account) throw new SbAccessError(404, 'Nie ma takiej osoby.');
        if (!account.isActive || !account.systemEmail)
            throw new SbAccessError(
                422,
                'Osoba nie ma aktywnego konta w PS z adresem logowania - nie ma dokąd wysłać zaproszenia.',
            );
        // Konto agenta ma rolę ENVI_EMPLOYEE, ale to tożsamość techniczna, nie człowiek.
        if (
            !SB_INVITABLE_ROLES.includes(account.systemRoleName as any) ||
            sameText(account.systemEmail, AGENT_SYSTEM_EMAIL)
        )
            throw new SbAccessError(
                422,
                'Do SB można zaprosić tylko pracownika albo kierownika ENVI.',
            );
        return account as SbPersonAccount & { systemEmail: string };
    }

    /** Zaproszenie albo odblokowanie: GitHub + Dysk, potem jeden zapis. */
    private static async grant(
        github: SbGithubGateway,
        action: Extract<SbAccessAction, 'INVITE' | 'UNBLOCK'>,
        account: SbPersonAccount & { systemEmail: string },
        record: SbAccessRecord | null,
        requestedByPersonId: number,
    ): Promise<SbAccessOperationOutcome> {
        const email = account.systemEmail;
        const gh = await this.ensureGithubInvitation(github, email, record);
        const dr = await this.ensureDriveReader(email, record);
        const result = combineResult([gh, dr]);
        const state: SbAccessStateInput | undefined =
            result === 'FAILED'
                ? undefined
                : {
                      statusCode: gh.isMember ? 'ACTIVE' : 'INVITED',
                      githubInvitationId: gh.invitationId,
                      drivePermissionId: dr.permissionId,
                  };
        return this.finish(account.personId, action, result, [gh, dr], state, requestedByPersonId);
    }

    /** Blokada albo odebranie: zdjęcie tego, co nadał moduł, potem jeden zapis. */
    private static async withdraw(
        action: Extract<SbAccessAction, 'BLOCK' | 'REVOKE'>,
        target: Extract<SbAccessStatus, 'BLOCKED' | 'REVOKED'>,
        personId: number,
        requestedByPersonId: number,
    ): Promise<SbAccessOperationOutcome> {
        const github = this.github();
        const record = await this.repository.getByPersonId(personId);
        assertOperationAllowed(
            action,
            record?.statusCode ?? null,
            !!record?.isGrantedManually,
        );
        const current = record as SbAccessRecord;
        const account = await this.repository.getPersonAccount(personId);
        const email = account?.systemEmail ?? null;
        const gh = await this.removeGithub(github, current, email);
        const dr = await this.removeDrive(current, email);
        const result = combineResult([gh, dr]);
        const state: SbAccessStateInput | undefined =
            result === 'FAILED'
                ? undefined
                : {
                      statusCode: target,
                      githubInvitationId: gh.invitationId,
                      drivePermissionId: dr.permissionId,
                  };
        return this.finish(personId, action, result, [gh, dr], state, requestedByPersonId);
    }

    private static async finish(
        personId: number,
        action: SbAccessAction,
        result: SbAccessOperationOutcome['result'],
        parts: PartOutcome[],
        state: SbAccessStateInput | undefined,
        requestedByPersonId: number,
    ): Promise<SbAccessOperationOutcome> {
        const note = sanitizeNote(parts.map((part) => part.note).join('; '));
        try {
            await this.recordTransition({
                personId,
                actionCode: action,
                resultCode: result,
                requestedByPersonId,
                note,
                state,
            });
        } catch (error) {
            // Zmiany zewnętrzne już zaszły - brak zapisu musi być głośny (500 + raport).
            throw new Error(
                sanitizeNote(
                    `Operacja SB wykonana na GitHubie/Dysku, ale zapis w rejestrze się nie powiódł (${errorText(error)}). Wynik: ${note}`,
                ),
            );
        }
        return {
            result,
            note,
            state: await this.repository.getByPersonId(personId),
        };
    }

    private static async ensureGithubInvitation(
        github: SbGithubGateway,
        email: string,
        record: SbAccessRecord | null,
    ): Promise<GithubPart> {
        try {
            if (record?.githubLogin) {
                const membership = await github.getMembership(record.githubLogin);
                if (membership?.state === 'active')
                    return {
                        ok: true,
                        isMember: true,
                        invitationId: null,
                        note: `GitHub: konto ${membership.login} jest już członkiem organizacji`,
                    };
            }
            const pending = await github.listPendingInvitations();
            const waiting = pending.find(
                (invitation) =>
                    (record?.githubInvitationId != null &&
                        invitation.id === record.githubInvitationId) ||
                    sameText(invitation.email, email),
            );
            if (waiting)
                return {
                    ok: true,
                    invitationId: waiting.id,
                    note: 'GitHub: zaproszenie już czeka na przyjęcie',
                };
            const invitation = await github.inviteByEmail(email);
            return {
                ok: true,
                invitationId: invitation.id,
                note: `GitHub: wysłano zaproszenie na ${email}`,
            };
        } catch (error) {
            return { ok: false, note: `GitHub: błąd - ${errorText(error)}` };
        }
    }

    private static async ensureDriveReader(
        email: string,
        record: SbAccessRecord | null,
    ): Promise<DrivePart> {
        try {
            if (record?.drivePermissionId) {
                const permission = await SbDriveGateway.getPermission(
                    record.drivePermissionId,
                );
                if (permission)
                    return {
                        ok: true,
                        permissionId: permission.id,
                        note: 'Dysk: uprawnienie do SB.ENVI już jest',
                    };
            }
            const existing = await SbDriveGateway.findPermissionByEmail(email);
            if (existing)
                // Nadane poza modułem: nie przejmujemy, więc blokada go nie zdejmie.
                return {
                    ok: true,
                    permissionId: null,
                    note: `Dysk: adres ma już uprawnienie do SB.ENVI nadane poza modułem (rola: ${existing.role}) - moduł go nie zdejmie`,
                };
            const permissionId = await SbDriveGateway.grantReader(email);
            return {
                ok: true,
                permissionId,
                note: 'Dysk: nadano czytelnika SB.ENVI',
            };
        } catch (error) {
            return { ok: false, note: `Dysk: błąd - ${errorText(error)}` };
        }
    }

    private static async removeGithub(
        github: SbGithubGateway,
        record: SbAccessRecord,
        email: string | null,
    ): Promise<GithubPart> {
        try {
            const notes: string[] = [];
            const pending = await github.listPendingInvitations();
            const toCancel = pending.filter(
                (invitation) =>
                    (record.githubInvitationId != null &&
                        invitation.id === record.githubInvitationId) ||
                    sameText(invitation.email, email),
            );
            for (const invitation of toCancel) {
                await github.cancelInvitation(invitation.id);
                notes.push('anulowano oczekujące zaproszenie');
            }
            const storedInvitationGone =
                record.githubInvitationId != null &&
                !toCancel.some((i) => i.id === record.githubInvitationId);

            if (record.githubLogin) {
                const membership = await github.getMembership(record.githubLogin);
                if (!membership)
                    notes.push(`konto ${record.githubLogin} nie jest członkiem organizacji`);
                else if (membership.role === 'admin')
                    return {
                        ok: false,
                        note: `GitHub: ${[
                            ...notes,
                            `konto ${membership.login} jest właścicielem organizacji - moduł go nie usuwa`,
                        ].join(', ')}`,
                    };
                else {
                    await github.removeMembership(record.githubLogin);
                    notes.push(`usunięto konto ${membership.login} z organizacji`);
                }
            } else if (storedInvitationGone) {
                // Zaproszenie po e-mailu zniknęło: przyjęte albo wygasło. Nie wiadomo, które
                // konto usunąć - nie udajemy sukcesu. Identyfikator zostaje do powtórki.
                return {
                    ok: false,
                    note: 'GitHub: zaproszenie nie czeka już na przyjęcie, a konto GitHub nie jest przypisane - nie wiadomo, kogo usunąć z organizacji. Przypisz konto GitHub i powtórz.',
                };
            }
            return {
                ok: true,
                invitationId: null,
                note: `GitHub: ${notes.length ? notes.join(', ') : 'nic do zdjęcia'}`,
            };
        } catch (error) {
            return { ok: false, note: `GitHub: błąd - ${errorText(error)}` };
        }
    }

    private static async removeDrive(
        record: SbAccessRecord,
        email: string | null,
    ): Promise<DrivePart> {
        try {
            if (record.drivePermissionId) {
                const permission = await SbDriveGateway.getPermission(
                    record.drivePermissionId,
                );
                if (!permission)
                    return {
                        ok: true,
                        permissionId: null,
                        note: 'Dysk: uprawnienia już nie było',
                    };
                if (permission.role !== 'reader')
                    return {
                        ok: false,
                        note: `Dysk: uprawnienie zmieniono ręcznie na rolę ${permission.role} - moduł go nie zdejmuje`,
                    };
                await SbDriveGateway.deletePermission(permission.id);
                return {
                    ok: true,
                    permissionId: null,
                    note: 'Dysk: usunięto czytelnika SB.ENVI',
                };
            }
            const existing = email
                ? await SbDriveGateway.findPermissionByEmail(email)
                : null;
            if (existing)
                return {
                    ok: false,
                    note: `Dysk: adres ma uprawnienie do SB.ENVI nadane poza modułem (rola: ${existing.role}) - moduł go nie zdejmuje, zdejmij ręcznie`,
                };
            return { ok: true, note: 'Dysk: nic do zdjęcia' };
        } catch (error) {
            return { ok: false, note: `Dysk: błąd - ${errorText(error)}` };
        }
    }
}
