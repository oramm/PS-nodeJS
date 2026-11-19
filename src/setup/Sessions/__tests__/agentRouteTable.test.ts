/// <reference types="jest" />
import { readFileSync } from 'fs';
import path from 'path';
import {
    AGENT_ROUTE_TABLE,
    agentRefusalReason,
    agentRoutesFor,
    findAgentRoute,
} from '../agentRouteTable';

// Prawdziwy Express z prawdziwymi routerami, ale bez src/index.ts (Mongo, nasłuch portu, zadania w tle).
jest.mock('../../../index', () => {
    const express = require('express');
    const multer = require('multer');
    return { app: express(), upload: multer({ storage: multer.memoryStorage() }) };
});

const SRC = path.join(__dirname, '../../..');

/** Trasy z działającego Expressu: routery w kolejności z index.ts plus trasy zapisane w samym index.ts. */
function expressRoutes(): Set<string> {
    // Moduł licencji sprawdza klucz już przy imporcie; w teście wystarczy poprawny kształt.
    process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY ??= '0'.repeat(64);
    const indexSource = readFileSync(path.join(SRC, 'index.ts'), 'utf8');
    const routerModules = [...indexSource.matchAll(/^require\('(\.\/[^']+)'\);/gm)].map((m) => m[1]);
    expect(routerModules.length).toBeGreaterThan(50);
    for (const module of routerModules) require(path.join(SRC, module));

    const routes = new Set<string>();
    // Trasy zapisane wprost w index.ts nie wchodzą do Expressu bez uruchomienia serwera.
    for (const m of indexSource.matchAll(/^app\.(get|post|put|delete|patch)\(\s*'([^']+)'/gm))
        routes.add(`${m[1].toUpperCase()} ${m[2]}`);

    const { app } = jest.requireMock('../../../index') as any;
    for (const layer of app._router.stack) {
        if (layer.handle?.stack)
            throw new Error(`Podrouter w Expressie (${layer.regexp}) - test i tabela tras muszą dostać prefiks`);
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) routes.add(`${method.toUpperCase()} ${layer.route.path}`);
    }
    return routes;
}

describe('AGD-1: tabela tras agenta osoby', () => {
    it('kompletność: każda trasa Expressu ma wpis i każdy wpis ma trasę', () => {
        const routes = expressRoutes();
        const table = AGENT_ROUTE_TABLE.map(([method, p]) => `${method} ${p}`);
        expect(new Set(table).size).toBe(table.length);
        expect([...routes].filter((r) => !table.includes(r))).toEqual([]);
        expect(table.filter((r) => !routes.has(r))).toEqual([]);
    });

    it('GET /agentRoutes oddaje agentowi tabelę z tym, co mu wolno, bez niczego poza trasą i powodem', () => {
        const { app } = jest.requireMock('../../../index') as any;
        const layer = app._router.stack.find((l: any) => l.route?.path === '/agentRoutes');
        const handler = layer.route.stack[0].handle;
        const send = jest.fn();
        const res: any = { send, status: jest.fn(() => res) };
        handler({ session: { userData: { isPersonAgent: true, personAgentPsDb: 'ro' } } }, res);
        const body = send.mock.calls[0][0] as any;
        expect(body.psDb).toBe('ro');
        expect(body.administrator).toBe('Marek Gazda');
        expect(Object.keys(body.routes[0]).sort()).toEqual(['access', 'allowed', 'method', 'path', 'reason']);
        expect(body.routes.find((r: any) => r.path === '/offers' && r.method === 'POST').allowed).toBe(true);
        expect(body.routes.find((r: any) => r.path === '/offer' && r.method === 'POST').allowed).toBe(false);

        send.mockClear();
        handler({ session: { userData: { isPersonAgent: false } } }, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('DELETE i /sbAccess są w tabeli zawsze zamknięte', () => {
        for (const [method, p, access] of AGENT_ROUTE_TABLE) {
            if (method === 'DELETE' || p.toLowerCase().startsWith('/sbaccess')) expect([method, p, access]).toEqual([method, p, 'zamkniete']);
            expect(['odczyt', 'zapis', 'zamkniete']).toContain(access);
        }
    });

    it('dopasowanie jak w Expressie: bez wielkości liter, końcowy ukośnik, HEAD jak GET', () => {
        expect(findAgentRoute('post', '/ContractReact/')?.access).toBe('zapis');
        expect(findAgentRoute('HEAD', '/session')?.access).toBe('odczyt');
        expect(findAgentRoute('GET', '/letter/12/extra/deeper')).toBeUndefined();
    });

    it('przy kilku pasujących wzorcach wygrywa najostrzejszy', () => {
        // '/sbAccess/me/mailboxes' pasuje też do '/sbAccess/:personId/mailboxes'; oba zamknięte.
        expect(findAgentRoute('GET', '/sbAccess/me/mailboxes')?.access).toBe('zamkniete');
        expect(agentRefusalReason('rw', 'POST', '/cost-invoices/sync')).toBe('pobiera i zapisuje masowo faktury zakupowe z KSeF');
    });

    it('poziom odczyt i zapis liczą to samo, co egzekwuje warstwa', () => {
        for (const level of ['ro', 'rw'] as const) {
            for (const r of agentRoutesFor(level)) {
                const concrete = r.path.replace(/:[^/]+/g, '1');
                expect([r.method, r.path, agentRefusalReason(level, r.method, concrete) === undefined]).toEqual([
                    r.method,
                    r.path,
                    r.allowed,
                ]);
            }
        }
    });
});
