import ToolsDb from '../ToolsDb';

// Regula, ktorej pilnuja te testy: pomocnik zwalnia i zatwierdza WYLACZNIE polaczenie,
// ktore sam pobral. Cudze zostawia wywolujacemu - niezaleznie od tego, czy dostal
// znacznik `isPartOfTransaction`, bo przez trzy lata wystarczylo go pominac, zeby
// pomocnik zwolnil cudze polaczenie i zamrozil aplikacje (HNG-2, HNG-4).

const fakeConn = () => ({
    threadId: 42,
    execute: jest.fn().mockResolvedValue([{ insertId: 7 }]),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
});

type Conn = ReturnType<typeof fakeConn>;

const wywolania: {
    nazwa: string;
    wywolaj: (conn: any, isPartOfTransaction?: boolean) => Promise<any>;
}[] = [
    {
        nazwa: 'addInDb',
        wywolaj: (conn, flaga) =>
            ToolsDb.addInDb('Contracts_Entities', { Pole: 1 }, conn, flaga),
    },
    {
        nazwa: 'editInDb',
        wywolaj: (conn, flaga) =>
            ToolsDb.editInDb(
                'Contracts_Entities',
                { id: 1, Pole: 1 },
                conn,
                flaga
            ),
    },
    {
        nazwa: 'deleteFromDb',
        wywolaj: (conn, flaga) =>
            ToolsDb.deleteFromDb('Contracts_Entities', { id: 1 }, conn, flaga),
    },
    {
        nazwa: 'executePreparedStmt',
        wywolaj: (conn, flaga) =>
            ToolsDb.executePreparedStmt(
                'UPDATE Contracts_Entities SET Pole = ? WHERE Id = ?',
                [1, 1],
                {},
                conn,
                flaga
            ),
    },
];

describe.each(wywolania)('$nazwa', ({ wywolaj }) => {
    describe('dostal CUDZE polaczenie', () => {
        it.each([
            ['ze znacznikiem transakcji', true],
            ['BEZ znacznika transakcji - to jest ta usterka', undefined],
            ['ze znacznikiem falszywym', false],
        ])('%s: nie zwalnia i nie zatwierdza', async (_opis, flaga) => {
            const conn = fakeConn();
            await wywolaj(conn, flaga as boolean | undefined);
            expect(conn.release).not.toHaveBeenCalled();
            expect(conn.commit).not.toHaveBeenCalled();
        });
    });

    it('pobral polaczenie sam: zwalnia je i zatwierdza', async () => {
        const conn = fakeConn();
        const stara = (ToolsDb as any)._pool;
        (ToolsDb as any)._pool = { getConnection: jest.fn().mockResolvedValue(conn) };
        try {
            await wywolaj(undefined);
        } finally {
            (ToolsDb as any)._pool = stara;
        }
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
    });
});

it('nie pozwala zadeklarowac udzialu w transakcji bez cudzego polaczenia', async () => {
    await expect(
        ToolsDb.addInDb('Contracts_Entities', { Pole: 1 }, undefined, true)
    ).rejects.toThrow('Cannot be part of transaction without external connection!');
});

// Kontrola negatywna dla powyzszych: gdyby `release` przestal byc w ogole wolany,
// testy "nie zwalnia" przechodzilyby z bledna implementacja. Ten sprawdza, ze atrapa
// rzeczywiscie rejestruje wywolanie.
it('atrapa polaczenia rejestruje zwolnienie', () => {
    const conn: Conn = fakeConn();
    conn.release();
    expect(conn.release).toHaveBeenCalledTimes(1);
});
