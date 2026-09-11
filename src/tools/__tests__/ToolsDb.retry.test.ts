import ToolsDb from '../ToolsDb';

// Zerwane polaczenie ponawiamy na TEJ SAMEJ puli. Wymiana calej puli rozrywala takze
// polaczenia, na ktorych inne zapytania czekaly na wynik, a mysql2 nie zglasza im wtedy
// bledu - te zapytania wisialy bez konca (awaria 2026-09-11: stojace synchronizacje
// AQM i FIDmana). Zepsute polaczenie mysql2 wyrzuca z puli samo.

const zerwane = () =>
    Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
        fatal: true,
    });

const atrapaPuli = (query: jest.Mock) => ({
    query,
    end: jest.fn().mockResolvedValue(undefined),
    getConnection: jest.fn(),
});

describe('getQueryCallbackAsync przy zerwanym polaczeniu', () => {
    let stara: any;

    beforeEach(() => {
        stara = (ToolsDb as any)._pool;
        jest.useFakeTimers();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        (ToolsDb as any)._pool = stara;
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('ponawia na tej samej puli i jej nie zamyka', async () => {
        const query = jest
            .fn()
            .mockRejectedValueOnce(zerwane())
            .mockResolvedValueOnce([[{ Id: 1 }]]);
        const pula = atrapaPuli(query);
        (ToolsDb as any)._pool = pula;

        const wynik = ToolsDb.getQueryCallbackAsync('SELECT 1');
        await jest.runAllTimersAsync();

        await expect(wynik).resolves.toEqual([{ Id: 1 }]);
        expect(query).toHaveBeenCalledTimes(2);
        expect(pula.end).not.toHaveBeenCalled();
        expect((ToolsDb as any)._pool).toBe(pula);
    });

    it('po trzech zerwaniach oddaje blad, nadal bez zamykania puli', async () => {
        const query = jest.fn().mockRejectedValue(zerwane());
        const pula = atrapaPuli(query);
        (ToolsDb as any)._pool = pula;

        const wynik = ToolsDb.getQueryCallbackAsync('SELECT 1');
        const asercja = expect(wynik).rejects.toMatchObject({
            code: 'ECONNRESET',
        });
        await jest.runAllTimersAsync();
        await asercja;

        expect(query).toHaveBeenCalledTimes(3);
        expect(pula.end).not.toHaveBeenCalled();
        expect((ToolsDb as any)._pool).toBe(pula);
    });

    // Ponawianie bledu limitu tylko dokladaloby prob logowania do zapchanego konta.
    it('bledu limitu polaczen konta (1203) nie ponawia', async () => {
        const limit = Object.assign(
            new Error(
                "User envikons_myEnvi already has more than 'max_user_connections' active connections"
            ),
            { code: 'ER_TOO_MANY_USER_CONNECTIONS', errno: 1203 }
        );
        const query = jest.fn().mockRejectedValue(limit);
        (ToolsDb as any)._pool = atrapaPuli(query);

        await expect(ToolsDb.getQueryCallbackAsync('SELECT 1')).rejects.toBe(
            limit
        );
        expect(query).toHaveBeenCalledTimes(1);
    });
});
