import requireSession from '../requireSession';
import { SystemRoleName } from '../../../types/sessionTypes';

const HUMAN_SESSION = {
    enviId: 125,
    systemEmail: 'oramwp@gmail.com',
    userName: 'Marek Gazda',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
};

function run(method: string, path: string, userData?: any) {
    const req: any = { method, path, ip: '::1', session: { userData } };
    const res: any = {
        statusCode: undefined,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        send(payload: any) {
            this.body = payload;
            return this;
        },
    };
    const next = jest.fn();

    requireSession(req, res, next);
    return { res, next };
}

describe('requireSession', () => {
    it('ODRZUCA anonimowe wywołanie trasy o skutku nieodwracalnym', () => {
        // Znalezione 2026-07-31: ta trasa wysyła fakturę do KSeF, czyli akt wobec urzędu
        // skarbowego, i nie sprawdzała sesji w ogóle (src/invoices/InvoicesRouters.ts).
        const { res, next } = run('POST', '/invoice/123/ksef/send');

        expect(res.statusCode).toBe(401);
        expect(res.body.errorMessage).toBe('Użytkownik niezalogowany');
        expect(next).not.toHaveBeenCalled();
    });

    it('ODRZUCA niszczenie wyrażone jako PUT — reguła nie opiera się na metodzie', () => {
        // PUT /deleteOfferBond/:id kasuje wadium. Bramka po metodzie HTTP by go nie objęła.
        const { res, next } = run('PUT', '/deleteOfferBond/640');

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('przepuszcza każde żądanie z sesją — to uwierzytelnienie, nie autoryzacja', () => {
        for (const [method, path] of [
            ['POST', '/invoice/123/ksef/send'],
            ['DELETE', '/letter/6163'],
            ['GET', '/contractsWithChildren'],
        ]) {
            const { res, next } = run(method, path, HUMAN_SESSION);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
        }
    });

    it('przepuszcza trasy z jawnej listy wyjątków, bez sesji', () => {
        for (const [method, path] of [
            ['POST', '/login'],
            ['POST', '/logout'],
            ['GET', '/session'],
            ['GET', '/oauthcallback'],
            ['POST', '/client-error'],
        ]) {
            const { res, next } = run(method, path);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
        }
    });

    it('przepuszcza formularz publiczny na całym prefiksie /v2/public/', () => {
        for (const [method, path] of [
            ['GET', '/v2/public/experience-update/abc123'],
            ['PUT', '/v2/public/experience-update/abc123/draft'],
            ['POST', '/v2/public/experience-update/abc123/submit'],
        ]) {
            const { res, next } = run(method, path);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
        }
    });

    it('nie myli prefiksu publicznego z trasą pracowniczą o podobnej nazwie', () => {
        // /v2/persons/... obsługuje ten sam moduł co /v2/public/..., ale jest dla pracowników.
        const { res, next } = run(
            'POST',
            '/v2/persons/125/experience-updates/link',
        );

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('prefiks publiczny musi ZACZYNAĆ ścieżkę, a nie gdziekolwiek w niej wystąpić', () => {
        // Dopasowanie „zawiera" zamiast „zaczyna się od" otwierałoby dowolną trasę temu,
        // kto dopisze /v2/public/ w środku adresu.
        const { res, next } = run('GET', '/v2/persons/125/v2/public/profile');

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('wyjątek jest per metoda — /login innym czasownikiem nie przechodzi', () => {
        const { res, next } = run('GET', '/login');

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('nie daje się ominąć wielkością liter ani końcowym ukośnikiem', () => {
        // Express domyślnie routuje bez rozróżniania wielkości liter i ignoruje końcowy
        // ukośnik, więc porównanie ścisłe zablokowałoby logowanie pod adresem /Login/.
        for (const path of ['/Login', '/login/', '/LOGIN/']) {
            const { next } = run('POST', path);
            expect(next).toHaveBeenCalled();
        }
        for (const path of ['/Invoice/123/KSEF/send', '/invoice/123/ksef/send/']) {
            const { res } = run('POST', path);
            expect(res.statusCode).toBe(401);
        }
    });

    it('odmawia bez udziału globalnego handlera błędów, żeby nie poszedł mail o awarii', () => {
        const { res, next } = run('GET', '/contractsWithChildren');

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });
});
