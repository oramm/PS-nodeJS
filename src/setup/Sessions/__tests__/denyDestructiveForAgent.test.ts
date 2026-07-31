import { SystemRoleName } from '../../../types/sessionTypes';

// Ten sam powód co w agentTokenAuth.test.ts: warstwa ciągnie SystemRoleService, a ten bazę.
jest.mock('../SystemRoleService');

import denyDestructiveForAgent from '../denyDestructiveForAgent';
import { AGENT_SYSTEM_EMAIL } from '../agentTokenAuth';

/** Konto agenta. Adres jest brany z modułu warstwy, nie przepisany — gdyby ktoś go tam
 *  zmienił, a polityki nie, ten test ma to zobaczyć. */
const AGENT_SESSION = {
    enviId: 613,
    systemEmail: AGENT_SYSTEM_EMAIL,
    userName: 'Agent automatyczny',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
};

/** Zwykły zalogowany człowiek — ta sama rola co agent, więc odróżnia ich wyłącznie adres.
 *  To jest sedno: rola `ENVI_EMPLOYEE` niczego nie zawężała. */
const HUMAN_SESSION = {
    enviId: 125,
    systemEmail: 'oramwp@gmail.com',
    userName: 'Marek Gazda',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
};

function run(method: string, userData?: any) {
    const req: any = {
        method,
        path: '/letter/6163',
        ip: '::1',
        session: { userData },
    };
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

    denyDestructiveForAgent(req, res, next);
    return { res, next };
}

describe('denyDestructiveForAgent', () => {
    it('ODRZUCA kasowanie zlecone tożsamością agenta', () => {
        // Odtworzone na produkcji 2026-07-31: DELETE /letter/6163 z {id:6164} w ciele
        // zwrócił 200 i zniszczył pismo 6164 razem z folderem na Dysku.
        const { res, next } = run('DELETE', AGENT_SESSION);

        expect(res.statusCode).toBe(403);
        expect(res.body.errorMessage).toMatch(/nie może kasować/);
        expect(next).not.toHaveBeenCalled();
    });

    it('nie rusza kasowania zleconego przez zalogowanego człowieka', () => {
        const { res, next } = run('DELETE', HUMAN_SESSION);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeUndefined();
    });

    it('nie rusza żądania bez sesji — o odmowie decyduje trasa, nie ta warstwa', () => {
        const { res, next } = run('DELETE', undefined);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeUndefined();
    });

    it('przepuszcza agentowi rejestrację i edycję — blokada dotyczy tylko niszczenia', () => {
        for (const method of ['POST', 'PUT', 'GET', 'PATCH']) {
            const { res, next } = run(method, AGENT_SESSION);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
        }
    });

    it('nie daje się ominąć metodą zapisaną małymi literami', () => {
        const { res, next } = run('delete', AGENT_SESSION);

        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('odmawia bez udziału globalnego handlera błędów, żeby nie poszedł mail o awarii', () => {
        // 403 wprost z warstwy. Rzucenie wyjątkiem dałoby 500 i raport błędu mailem
        // na adresy firmowe (src/index.ts) — a to nie jest awaria, tylko polityka.
        const { res, next } = run('DELETE', AGENT_SESSION);

        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });
});
