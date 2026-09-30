import { SB_GITHUB_ORG } from './sbAccessPolicy';

/**
 * Wywołania GitHub REST API dla organizacji SB. Tylko transport: zero decyzji biznesowych.
 * Token (fine-grained, "Members: read and write", tylko ta organizacja - decyzja D1) podaje
 * wołający; nigdy nie trafia do komunikatów błędów.
 */

export class GithubApiError extends Error {
    constructor(
        public readonly httpStatus: number,
        message: string,
    ) {
        super(message);
        this.name = 'GithubApiError';
    }
}

export interface GithubInvitation {
    id: number;
    email: string | null;
    login: string | null;
}

export interface GithubMembership {
    /** active = członek; pending = zaproszenie po nazwie konta czeka na przyjęcie. */
    state: 'active' | 'pending';
    /** admin = właściciel organizacji; moduł takiego konta nigdy nie usuwa. */
    role: 'admin' | 'member' | string;
    login: string;
}

const API = 'https://api.github.com';
const PAGE_SIZE = 100;
/** Bezpiecznik pętli stronicowania; organizacja ma kilkanaście osób. */
const MAX_PAGES = 20;

export default class SbGithubGateway {
    constructor(private readonly token: string) {}

    private async request(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        body?: Record<string, unknown>,
    ): Promise<{ status: number; data: any }> {
        const response = await fetch(`${API}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'ps-envi-sb-access',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        let data: any = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }
        if (!response.ok) {
            // Tylko status i pole message z odpowiedzi - bez nagłówków i bez tokenu.
            const detail =
                typeof data?.message === 'string' ? data.message : 'bez opisu';
            const errors = Array.isArray(data?.errors)
                ? data.errors
                      .map((e: any) => e?.message)
                      .filter((m: unknown) => typeof m === 'string')
                      .join('; ')
                : '';
            throw new GithubApiError(
                response.status,
                `GitHub ${response.status}: ${detail}${errors ? ` (${errors})` : ''}`,
            );
        }
        return { status: response.status, data };
    }

    private async listAll<T>(path: string): Promise<T[]> {
        const all: T[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const separator = path.includes('?') ? '&' : '?';
            const { data } = await this.request(
                'GET',
                `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`,
            );
            const items = Array.isArray(data) ? (data as T[]) : [];
            all.push(...items);
            if (items.length < PAGE_SIZE) break;
        }
        return all;
    }

    private orgPath(suffix: string): string {
        return `/orgs/${encodeURIComponent(SB_GITHUB_ORG)}${suffix}`;
    }

    /** Oczekujące zaproszenia organizacji. */
    async listPendingInvitations(): Promise<GithubInvitation[]> {
        const rows = await this.listAll<any>(this.orgPath('/invitations'));
        return rows.map((row) => ({
            id: Number(row.id),
            email: row.email ?? null,
            login: row.login ?? null,
        }));
    }

    /** Zaproszenie po e-mailu jako zwykły członek. */
    async inviteByEmail(email: string): Promise<GithubInvitation> {
        const { data } = await this.request(
            'POST',
            this.orgPath('/invitations'),
            { email, role: 'direct_member' },
        );
        return {
            id: Number(data.id),
            email: data.email ?? email,
            login: data.login ?? null,
        };
    }

    /** Anulowanie oczekującego zaproszenia. false = już go nie ma (404). */
    async cancelInvitation(invitationId: number): Promise<boolean> {
        try {
            await this.request(
                'DELETE',
                this.orgPath(`/invitations/${encodeURIComponent(String(invitationId))}`),
            );
            return true;
        } catch (error) {
            if (error instanceof GithubApiError && error.httpStatus === 404)
                return false;
            throw error;
        }
    }

    /** Członkostwo konta w organizacji; null = nie jest członkiem (404). */
    async getMembership(login: string): Promise<GithubMembership | null> {
        try {
            const { data } = await this.request(
                'GET',
                this.orgPath(`/memberships/${encodeURIComponent(login)}`),
            );
            return {
                state: data.state,
                role: data.role,
                login: data.user?.login ?? login,
            };
        } catch (error) {
            if (error instanceof GithubApiError && error.httpStatus === 404)
                return null;
            throw error;
        }
    }

    /** Usunięcie członkostwa. false = konto już nie było członkiem (404). */
    async removeMembership(login: string): Promise<boolean> {
        try {
            await this.request(
                'DELETE',
                this.orgPath(`/memberships/${encodeURIComponent(login)}`),
            );
            return true;
        } catch (error) {
            if (error instanceof GithubApiError && error.httpStatus === 404)
                return false;
            throw error;
        }
    }

    /** Loginy wszystkich członków organizacji. */
    async listMemberLogins(): Promise<string[]> {
        const rows = await this.listAll<any>(this.orgPath('/members'));
        return rows
            .map((row) => row.login)
            .filter((login): login is string => typeof login === 'string');
    }
}
