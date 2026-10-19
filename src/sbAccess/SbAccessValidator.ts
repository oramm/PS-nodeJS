import { GITHUB_LOGIN_PATTERN, SbAccessError } from './sbAccessPolicy';
import {
    SB_DRIVE_LEVELS,
    SB_MAILBOX_PATTERN,
    SB_MAX_MAILBOXES,
    SB_PS_DB_LEVELS,
    SB_REPO_LEVELS,
    SbAccessLevels,
} from './sbAccessTypes';

/**
 * Walidacja wejścia tras /sbAccess. Celowo NIE przyjmuje adresu e-mail: adres zaproszenia
 * pochodzi wyłącznie z bazy (adres logowania osoby do PS).
 */
export default class SbAccessValidator {
    static requirePersonId(value: unknown): number {
        const personId = Number(value);
        if (!Number.isInteger(personId) || personId <= 0)
            throw new SbAccessError(400, 'Nieprawidłowy identyfikator osoby.');
        return personId;
    }

    static requireGithubLogin(body: unknown): string {
        const raw = (body as any)?.githubLogin;
        const login = typeof raw === 'string' ? raw.trim().replace(/^@/, '') : '';
        if (!GITHUB_LOGIN_PATTERN.test(login))
            throw new SbAccessError(400, 'Nieprawidłowa nazwa konta GitHub.');
        return login;
    }

    /** Poziomy z ciała żądania: wszystkie pola wymagane, poczta może być pominięta. */
    static parseLevels(raw: unknown): SbAccessLevels {
        const body = raw as any;
        if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new SbAccessError(400, 'Nieprawidłowe poziomy dostępu.');
        const pick = <T extends string>(
            value: unknown,
            allowed: readonly T[],
            label: string,
        ): T => {
            if (!allowed.includes(value as T))
                throw new SbAccessError(400, `Nieprawidłowy poziom: ${label}.`);
            return value as T;
        };
        const mail = body.mail ?? [];
        if (!Array.isArray(mail) || mail.length > SB_MAX_MAILBOXES)
            throw new SbAccessError(400, 'Nieprawidłowa lista skrzynek poczty.');
        for (const code of mail)
            if (typeof code !== 'string' || !SB_MAILBOX_PATTERN.test(code))
                throw new SbAccessError(400, 'Nieprawidłowy kod skrzynki poczty.');
        if (new Set(mail).size !== mail.length)
            throw new SbAccessError(400, 'Kody skrzynek poczty nie mogą się powtarzać.');
        return {
            repos: pick(body.repos, SB_REPO_LEVELS, 'repozytoria'),
            psDb: pick(body.psDb, SB_PS_DB_LEVELS, 'baza PS'),
            drive: pick(body.drive, SB_DRIVE_LEVELS, 'Dysk'),
            mail: [...mail],
        };
    }

    /** Odczyt kolumny Levels (tekst JSON albo obiekt); brak lub błąd = wszystko 'none'. */
    static levelsFromDb(raw: unknown): SbAccessLevels {
        try {
            if (raw == null) throw new Error('brak');
            return this.parseLevels(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } catch {
            return { repos: 'none', psDb: 'none', drive: 'none', mail: [] };
        }
    }

    static optionalLimit(value: unknown): number | undefined {
        if (value === undefined || value === '') return undefined;
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit <= 0)
            throw new SbAccessError(400, 'Nieprawidłowy limit.');
        return limit;
    }
}
