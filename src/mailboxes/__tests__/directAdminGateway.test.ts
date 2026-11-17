import DirectAdminGateway, { DirectAdminRejectionError, DirectAdminUnknownResultError } from '../directAdminGateway';

const envKeys = [
    'DIRECTADMIN_URL', 'DIRECTADMIN_LOGIN_USER', 'DIRECTADMIN_LOGIN_KEY', 'DIRECTADMIN_MAILBOX_QUOTA_MB', 'DIRECTADMIN_AGENT_COPY_ADDRESS',
] as const;
const password = 'MailboxSecret987654321';
const address = 'projekt.ik.01@envi.com.pl';

describe('DirectAdminGateway (wyłącznie atrapa sieci)', () => {
    let originalEnv: (string | undefined)[];
    let originalFetch: typeof fetch;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        originalEnv = envKeys.map((key) => process.env[key]);
        originalFetch = global.fetch;
        process.env.DIRECTADMIN_URL = 'https://mail.example.test:2222';
        process.env.DIRECTADMIN_LOGIN_USER = 'test-account';
        process.env.DIRECTADMIN_LOGIN_KEY = 'test-key';
        process.env.DIRECTADMIN_MAILBOX_QUOTA_MB = '';
        process.env.DIRECTADMIN_AGENT_COPY_ADDRESS = 'sb-agent@envi.com.pl';
        fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => 'error=0&text=OK' });
        global.fetch = fetchMock;
    });

    afterEach(() => {
        envKeys.forEach((key, index) => {
            if (originalEnv[index] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[index];
        });
        global.fetch = originalFetch;
    });

    it('error=0 oznacza sukces; wysyła domenę, limit, oba hasła i domyślną pojemność', async () => {
        await expect(DirectAdminGateway.create(address, password)).resolves.toBeUndefined();
        const [endpoint, request] = fetchMock.mock.calls[0];
        expect(endpoint.toString()).toBe('https://mail.example.test:2222/CMD_API_POP');
        expect(request).toMatchObject({
            method: 'POST',
            redirect: 'error',
            headers: {
                Authorization: `Basic ${Buffer.from('test-account:test-key').toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
            action: 'create', domain: 'envi.com.pl', user: 'projekt.ik.01',
            passwd: password, passwd2: password, quota: '2048', limit: '10000',
        });
        expect(request.signal).toBeInstanceOf(AbortSignal);
    });

    it('zmiana hasła nie wysyła limitów ani nie waliduje pojemności', async () => {
        process.env.DIRECTADMIN_MAILBOX_QUOTA_MB = 'invalid';
        await DirectAdminGateway.changePassword(address, password);
        const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
        expect(Object.fromEntries(body)).toEqual({ action: 'modify', domain: 'envi.com.pl',
            user: 'projekt.ik.01', passwd: password, passwd2: password });
    });

    it.each(envKeys.slice(0, 3))('brak %s nie wywołuje sieci', async (key) => {
        delete process.env[key];
        await expect(DirectAdminGateway.create(address, password)).rejects.toThrow('Serwer poczty nie jest skonfigurowany');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['http://mail.example.test', 'bad-url', 'https://user:secret@mail.example.test'])('odrzuca niebezpieczny URL %s bez wywołania sieci', async (url) => {
        process.env.DIRECTADMIN_URL = url;
        await expect(DirectAdminGateway.create(address, password)).rejects.toThrow('Serwer poczty nie jest skonfigurowany');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['0', '-1', '1.5', 'NaN', '9007199254740992'])('odrzuca błędną pojemność %s bez wywołania sieci', async (quota) => {
        process.env.DIRECTADMIN_MAILBOX_QUOTA_MB = quota;
        await expect(DirectAdminGateway.create(address, password)).rejects.toThrow('Serwer poczty nie jest skonfigurowany');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['details', 'Email account already exists', 'Ten adres e-mail jest już zajęty na serwerze poczty'],
        ['text', 'Przekroczony limit pakietu', 'Serwer poczty nie pozwala założyć skrzynki z powodu limitu pakietu'],
        ['details', 'Authentication failed', 'Serwer poczty odrzucił logowanie. Skontaktuj się z administratorem'],
        ['details', 'unknown rejection', 'Serwer poczty odrzucił operację. Skontaktuj się z administratorem'],
    ])('HTTP 200 i error=1: mapuje %s na bezpieczny polski komunikat', async (field, text, expected) => {
        fetchMock.mockResolvedValue({
            ok: true, text: async () => new URLSearchParams({ error: '1', [field]: `${text} ${password}` }).toString(),
        });
        const error = await DirectAdminGateway.create(address, password).catch((caught) => caught);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DirectAdminRejectionError);
        expect(error.message).toBe(expected);
        expect(error.cause).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain(password);
        expect(String(error)).not.toContain(password);
    });

    it('brak error=0 nie jest sukcesem nawet przy HTTP 200', async () => {
        fetchMock.mockResolvedValue({ ok: true, text: async () => 'text=OK' });
        await expect(DirectAdminGateway.create(address, password)).rejects.toBeInstanceOf(DirectAdminUnknownResultError);
    });

    it('błąd HTTP nie jest sukcesem i jego treść nie jest odczytywana', async () => {
        const text = jest.fn().mockResolvedValue(password);
        fetchMock.mockResolvedValue({ ok: false, status: 500, text });
        await expect(DirectAdminGateway.create(address, password)).rejects.toBeInstanceOf(DirectAdminUnknownResultError);
        expect(text).not.toHaveBeenCalled();
    });

    it('błąd klienta z hasłem w config.data nie wychodzi z bramy ani do logów', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation();
        const warn = jest.spyOn(console, 'warn').mockImplementation();
        const report = jest.spyOn(console, 'error').mockImplementation();
        const raw = Object.assign(new Error(password), { config: { data: `passwd=${password}` } });
        fetchMock.mockRejectedValue(raw);
        const error = await DirectAdminGateway.create(address, password).catch((caught) => caught);
        expect(error).not.toBe(raw);
        expect(error.message).toBe('Nie można połączyć się z serwerem poczty. Spróbuj ponownie później');
        expect(error.cause).toBeUndefined();
        expect(error.config).toBeUndefined();
        expect(String(error)).not.toContain(password);
        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(report).not.toHaveBeenCalled();
    });

    it('błąd odczytu odpowiedzi też nie przenosi obiektu z hasłem', async () => {
        fetchMock.mockResolvedValue({ ok: true, text: async () => { throw new Error(password); } });
        await expect(DirectAdminGateway.changePassword(address, password)).rejects.toThrow('Nie można połączyć się z serwerem poczty');
    });
    it('tworzy kopię z własnym adresem skrzynki, po odczycie istniejących przekierowań', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'inna=someone%40example.test' });
        await DirectAdminGateway.setAgentCopy(address);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0].pathname).toBe('/CMD_API_EMAIL_FORWARDERS');
        expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body)))
            .toEqual({ action: 'list', domain: 'envi.com.pl' });
        expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[1][1].body)))
            .toEqual({ action: 'create', domain: 'envi.com.pl', user: 'projekt.ik.01', email: 'sb-agent@envi.com.pl' });
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(fetchMock.mock.calls[0][1].headers.Authorization);
    });

    it('przekierowanie z kontem technicznym jest idempotentne, bez zapisu', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, text: async () => new URLSearchParams({ 'projekt.ik.01': 'other@example.test,SB-agent@envi.com.pl' }).toString() });
        await DirectAdminGateway.setAgentCopy(address);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('modify zachowuje całą obcą konfigurację i nie dodaje adresu samej skrzynki', async () => {
        const existing = 'one@example.test,two@example.test';
        fetchMock.mockResolvedValueOnce({ ok: true, text: async () => new URLSearchParams({ 'projekt.ik.01': existing }).toString() });
        await DirectAdminGateway.setAgentCopy(address);
        expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[1][1].body)))
            .toEqual({ action: 'modify', domain: 'envi.com.pl', user: 'projekt.ik.01', email: `${existing},sb-agent@envi.com.pl` });
    });

    it.each([undefined, '', 'wrong@other.test', 'not-an-address', 'a..b@envi.com.pl'])('brak lub błędny adres kopii (%s) nie wywołuje sieci', async copy => {
        if (copy === undefined) delete process.env.DIRECTADMIN_AGENT_COPY_ADDRESS;
        else process.env.DIRECTADMIN_AGENT_COPY_ADDRESS = copy;
        await expect(DirectAdminGateway.setAgentCopy(address)).rejects.toThrow('Kopia poczty dla agenta nie jest skonfigurowana');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['list', 'create', 'modify'])('error=1 przy %s to bezpieczny komunikat, bez odpowiedzi serwera', async action => {
        const raw = new URLSearchParams({ error: '1', details: password }).toString();
        fetchMock.mockResolvedValueOnce({ ok: true, text: async () => action === 'list' ? raw : action === 'modify' ? 'projekt.ik.01=one%40example.test' : '' });
        fetchMock.mockResolvedValueOnce({ ok: true, text: async () => raw });
        const error = await DirectAdminGateway.setAgentCopy(address).catch(error => error);
        expect(error.message).toBe('Serwer poczty odrzucił operację. Skontaktuj się z administratorem');
        expect(String(error)).not.toContain(password);
        expect(error.cause).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(action === 'list' ? 1 : 2);
    });

    it('surowy błąd HTTP kopii z poświadczeniami nie trafia do komunikatu ani logów', async () => {
        const log = jest.spyOn(console, 'error').mockImplementation();
        fetchMock.mockRejectedValue(Object.assign(new Error(password), { config: { data: password } }));
        const error = await DirectAdminGateway.setAgentCopy(address).catch(error => error);
        expect(error.message).toBe('Nie można połączyć się z serwerem poczty. Spróbuj ponownie później');
        expect(error.config).toBeUndefined();
        expect(log).not.toHaveBeenCalled();
    });

});
