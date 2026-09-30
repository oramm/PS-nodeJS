import { GITHUB_LOGIN_PATTERN, SbAccessError } from './sbAccessPolicy';

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

    static optionalLimit(value: unknown): number | undefined {
        if (value === undefined || value === '') return undefined;
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit <= 0)
            throw new SbAccessError(400, 'Nieprawidłowy limit.');
        return limit;
    }
}
