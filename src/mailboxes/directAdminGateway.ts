const NOT_CONFIGURED = 'Serwer poczty nie jest skonfigurowany';

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
        // MBX-4: tutaj dojdzie kopia poczty na sb-agent@envi.com.pl przez CMD_API_EMAIL_FORWARDERS.
    }

    static async changePassword(address: string, password: string): Promise<void> {
        // shortcut: action=modify nie sprawdzono na prawdziwym serwerze; zweryfikować przy odbiorze integracji za GO właściciela.
        await this.request('modify', address, password);
    }

    private static async request(action: 'create' | 'modify', address: string, password: string): Promise<void> {
        const { DIRECTADMIN_URL, DIRECTADMIN_LOGIN_USER, DIRECTADMIN_LOGIN_KEY } = process.env;
        if (!DIRECTADMIN_URL?.trim() || !DIRECTADMIN_LOGIN_USER?.trim() || !DIRECTADMIN_LOGIN_KEY?.trim())
            throw new Error(NOT_CONFIGURED);

        let endpoint: URL;
        try {
            const base = new URL(DIRECTADMIN_URL);
            if (base.protocol !== 'https:' || base.username || base.password)
                throw new Error();
            endpoint = new URL('/CMD_API_POP', base);
        } catch {
            throw new Error(NOT_CONFIGURED);
        }
        const quota = process.env.DIRECTADMIN_MAILBOX_QUOTA_MB?.trim() || '2048';
        if (!/^\d+$/.test(quota) || !Number.isSafeInteger(Number(quota)) || Number(quota) <= 0)
            throw new Error(NOT_CONFIGURED);

        const body = new URLSearchParams({
            action,
            domain: 'envi.com.pl',
            user: address.split('@')[0],
            passwd: password,
            passwd2: password,
            quota,
            limit: '10000',
        });
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
            throw new Error('Nie można połączyć się z serwerem poczty. Spróbuj ponownie później');
        }
        if (result.get('error') !== '0')
            throw new Error(rejectionMessage(`${result.get('details') || ''} ${result.get('text') || ''}`));
    }
}
