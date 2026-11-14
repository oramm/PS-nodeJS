const NOT_CONFIGURED = 'Serwer poczty nie jest skonfigurowany';

export class DirectAdminUnknownResultError extends Error {}
export class DirectAdminRejectionError extends Error {
    constructor(message: string, readonly addressTaken: boolean) { super(message); }
}

function rejectionMessage(details: string): string {
    const message = details.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/already exists|already in use|istnieje|zajet/.test(message))
        return 'Ten adres e-mail jest już zajęty na serwerze poczty';
    if (/quota|limit|disk|space|pakiet|miejsc/.test(message))
        return 'Serwer poczty nie pozwala założyć skrzynki z powodu limitu pakietu';
    if (/unauthori[sz]ed|authentication|permission|access denied|logowanie|uprawnien/.test(message))
        return 'Serwer poczty odrzucił logowanie. Skontaktuj się z administratorem';
    return 'Serwer poczty odrzucił operację. Skontaktuj się z administratorem';
}

export default class DirectAdminGateway {
    static async create(address: string, password: string): Promise<void> {
        await this.request('create', address, password);
    }

    static async changePassword(address: string, password: string): Promise<void> {
        // Test na serwerze 2026-11-14: modify bez quota i limit zachowuje dotychczasowe limity skrzynki.
        await this.request('modify', address, password);
    }

    private static async request(action: 'create' | 'modify', address: string, password: string): Promise<void> {
        const body = new URLSearchParams({
            action, domain: 'envi.com.pl', user: address.split('@')[0],
            passwd: password, passwd2: password,
        });
        if (action === 'create') {
            const quota = process.env.DIRECTADMIN_MAILBOX_QUOTA_MB?.trim() || '2048';
            if (!/^\d+$/.test(quota) || !Number.isSafeInteger(Number(quota)) || Number(quota) <= 0)
                throw new Error(NOT_CONFIGURED);
            body.set('quota', quota);
            body.set('limit', '10000');
        }
        await this.send('CMD_API_POP', body);
    }

    static async accountExists(address: string): Promise<boolean> {
        const result = await this.send('CMD_API_POP', new URLSearchParams({ action: 'list', domain: 'envi.com.pl' }), true);
        if ([...result.keys()].some(key => key !== 'list[]' && key !== 'error') ||
            result.getAll('list[]').some(user => !/^[a-z0-9][a-z0-9._+-]*$/i.test(user)))
            throw new DirectAdminUnknownResultError('Nie udało się odczytać listy skrzynek z serwera poczty.');
        return result.getAll('list[]').some(user => user.toLowerCase() === address.split('@')[0].toLowerCase());
    }

    static async setAgentCopy(address: string): Promise<void> {
        const copy = process.env.DIRECTADMIN_AGENT_COPY_ADDRESS?.trim().toLowerCase();
        if (!copy || !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@envi\.com\.pl$/.test(copy) || copy.includes('..'))
            throw new Error('Kopia poczty dla agenta nie jest skonfigurowana');
        if (address.toLowerCase() === copy)
            throw new Error('Nie można ustawić kopii konta technicznego na nie samo');
        const user = address.split('@')[0];
        const list = await this.send('CMD_API_EMAIL_FORWARDERS', new URLSearchParams({ action: 'list', domain: 'envi.com.pl' }), true);
        const existing = list.get(user);
        const recipients = existing === null ? [] : existing.split(',');
        if (recipients.some(recipient => recipient.trim().toLowerCase() === copy)) return;
        // Przekierowanie o nazwie skrzynki nie zabiera jej poczty (test na serwerze 2026-11-14), więc bez własnego adresu.
        const email = existing === null ? copy : `${existing},${copy}`;
        await this.send('CMD_API_EMAIL_FORWARDERS', new URLSearchParams({
            action: existing === null ? 'create' : 'modify', domain: 'envi.com.pl', user, email,
        }));
    }

    private static async send(command: string, body: URLSearchParams, listing = false): Promise<URLSearchParams> {
        const { DIRECTADMIN_URL, DIRECTADMIN_LOGIN_USER, DIRECTADMIN_LOGIN_KEY } = process.env;
        if (!DIRECTADMIN_URL?.trim() || !DIRECTADMIN_LOGIN_USER?.trim() || !DIRECTADMIN_LOGIN_KEY?.trim())
            throw new Error(NOT_CONFIGURED);

        let endpoint: URL;
        try {
            const base = new URL(DIRECTADMIN_URL);
            if (base.protocol !== 'https:' || base.username || base.password)
                throw new Error();
            endpoint = new URL(`/${command}`, base);
        } catch {
            throw new Error(NOT_CONFIGURED);
        }
        let result: URLSearchParams;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${Buffer.from(`${DIRECTADMIN_LOGIN_USER}:${DIRECTADMIN_LOGIN_KEY}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body.toString(),
                redirect: 'error',
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error();
            result = new URLSearchParams(await response.text());
        } catch {
            // Nie przekazujemy błędu klienta HTTP: może zawierać hasło w treści żądania.
            throw new DirectAdminUnknownResultError('Nie można połączyć się z serwerem poczty. Spróbuj ponownie później');
        }
        if (!listing && !/^\d+$/.test(result.get('error') ?? ''))
            throw new DirectAdminUnknownResultError('Nie udało się odczytać wyniku operacji na serwerze poczty. Sprawdź skrzynkę ręcznie.');
        if (listing ? result.has('error') && result.get('error') !== '0' : result.get('error') !== '0') {
            const message = rejectionMessage(`${result.get('details') || ''} ${result.get('text') || ''}`);
            throw new DirectAdminRejectionError(message, message === 'Ten adres e-mail jest już zajęty na serwerze poczty');
        }
        return result;
    }
}
