import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import ToolsDb from '../../tools/ToolsDb';
import SbAccessEventRepository from '../SbAccessEventRepository';

describe('SbAccessEventRepository', () => {
    const repository = new SbAccessEventRepository();
    const conn = { threadId: 1 } as any;

    it('append wykonuje parametryzowany INSERT na przekazanym conn', async () => {
        const execute = jest
            .spyOn(ToolsDb, 'executeSQL')
            .mockResolvedValue({} as any);
        await repository.append(conn, {
            personId: 17,
            actionCode: 'INVITE',
            requestedByPersonId: 18,
            resultCode: 'FAILED',
            note: "Błąd 'API'",
        });
        expect(execute).toHaveBeenCalledWith(
            expect.stringMatching(
                /INSERT INTO SbAccessEvents[\s\S]*VALUES \(\?, \?, \?, \?, \?\)/,
            ),
            [17, 'INVITE', 18, 'FAILED', "Błąd 'API'"],
            conn,
        );
    });

    it('brak autora i uwagi zapisuje NULL; brak conn nie wykonuje zapisu', async () => {
        const execute = jest
            .spyOn(ToolsDb, 'executeSQL')
            .mockResolvedValue({} as any);
        const input = {
            personId: 17,
            actionCode: 'SEED' as const,
            resultCode: 'OK' as const,
        };
        await repository.append(conn, input);
        expect(execute.mock.calls[0][1]).toEqual([
            17,
            'SEED',
            null,
            'OK',
            null,
        ]);
        await expect(
            repository.append(undefined as any, input),
        ).rejects.toThrow('połączenia');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('prototyp udostępnia wyłącznie dopisywanie i odczyt', () => {
        expect(
            Object.getOwnPropertyNames(
                SbAccessEventRepository.prototype,
            ).sort(),
        ).toEqual(['append', 'constructor', 'listByPersonId']);
        expect(Object.getPrototypeOf(SbAccessEventRepository.prototype)).toBe(
            Object.prototype,
        );
    });

    it('żaden plik modułu nie zawiera SQL zmieniającego lub usuwającego zdarzenia', () => {
        const dir = join(__dirname, '..');
        for (const file of readdirSync(dir).filter((name) =>
            name.endsWith('.ts'),
        )) {
            const source = readFileSync(join(dir, file), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\r\n]*/g, '');
            expect(source).not.toMatch(/UPDATE\s+SbAccessEvents/i);
            expect(source).not.toMatch(/DELETE\s+FROM\s+SbAccessEvents/i);
        }
    });

    it.each([
        [undefined, 50],
        [3, 3],
        [2.9, 2],
        [0, 1],
        [1000, 500],
        [NaN, 50],
    ])(
        'historia ma autora, czynność, kolejność i bezpieczny limit %p',
        async (limit, expected) => {
            const query = jest
                .spyOn(ToolsDb, 'getQueryCallbackAsync')
                .mockResolvedValue([] as any);
            await repository.listByPersonId(17, limit);
            expect(query.mock.calls[0][0]).toContain('LEFT JOIN Persons');
            expect(query.mock.calls[0][0]).toContain('a.Name AS actionName');
            expect(query.mock.calls[0][0]).toContain(
                'ORDER BY e.CreatedAt DESC, e.Id DESC LIMIT ?',
            );
            expect(query.mock.calls[0][2]).toEqual([17, expected]);
        },
    );
});
