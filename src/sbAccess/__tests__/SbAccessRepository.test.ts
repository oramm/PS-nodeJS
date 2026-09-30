import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import SbAccessRepository from '../SbAccessRepository';

describe('SbAccessRepository', () => {
    const repository = new SbAccessRepository();
    const conn = { threadId: 1 } as any;
    let execute: ReturnType<typeof jest.spyOn>;
    let select: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        jest.restoreAllMocks();
        select = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([] as any);
        execute = jest
            .spyOn(ToolsDb, 'executeSQL')
            .mockResolvedValue({} as any);
    });

    it('nowa osoba: INSERT z parametrami na przekazanym połączeniu', async () => {
        select.mockResolvedValue([] as any);
        await repository.upsertState(conn, {
            personId: 17,
            statusCode: 'ACTIVE',
            githubLogin: "login'",
            githubInvitationId: 123,
            drivePermissionId: 'drive',
            isGrantedManually: true,
        });
        expect(select.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(select.mock.calls[0][1]).toBe(conn);
        const [sql, params, usedConn] = execute.mock.calls[0];
        expect(sql).toContain('INSERT INTO SbAccess');
        expect(sql).not.toContain('ON DUPLICATE');
        expect(sql).toContain('VALUES (?, ?, ?, ?, ?, ?)');
        expect(sql).not.toContain("login'");
        expect(params).toEqual([17, 'ACTIVE', "login'", 123, 'drive', 1]);
        expect(usedConn).toBe(conn);
    });

    it('istniejąca osoba: UPDATE po PersonId; undefined pomija kolumny, null czyści pola', async () => {
        select.mockResolvedValue([{ Id: 4 }] as any);
        await repository.upsertState(conn, {
            personId: 17,
            statusCode: 'BLOCKED',
            githubLogin: undefined,
            githubInvitationId: null,
            drivePermissionId: null,
        });
        const [sql, params, usedConn] = execute.mock.calls[0];
        expect(sql).toContain('UPDATE SbAccess SET');
        expect(sql).toContain('WHERE PersonId = ?');
        expect(sql).not.toContain('GithubLogin');
        expect(sql).not.toContain('IsGrantedManually');
        expect(sql).toContain('GithubInvitationId = ?');
        expect(sql).toContain('DrivePermissionId = ?');
        expect(params).toEqual(['BLOCKED', null, null, 17]);
        expect(usedConn).toBe(conn);
    });

    it('konflikt loginu innej osoby: błąd bazy propaguje się, a zapis nie dotyka cudzego wiersza', async () => {
        select.mockResolvedValue([] as any);
        execute.mockRejectedValue(
            Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
        );
        await expect(
            repository.upsertState(conn, {
                personId: 17,
                statusCode: 'ACTIVE',
                githubLogin: 'zajety',
            }),
        ).rejects.toThrow('Duplicate entry');
        // Zadnego ON DUPLICATE KEY UPDATE, ktory nadpisalby wiersz innej osoby.
        expect(execute.mock.calls[0][0]).not.toContain('ON DUPLICATE');
    });

    it('brak conn kończy się błędem przed zapisem', async () => {
        await expect(
            repository.upsertState(undefined as any, {
                personId: 17,
                statusCode: 'ACTIVE',
            }),
        ).rejects.toThrow('połączenia');
        expect(execute).not.toHaveBeenCalled();
    });

    it('odczyty parametryzują filtry i mapują flagę na boolean', async () => {
        const query = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([{ personId: 17, isGrantedManually: 0 }] as any);
        expect(await repository.getByPersonId(17, conn)).toMatchObject({
            isGrantedManually: false,
        });
        expect(query.mock.calls[0][1]).toBe(conn);
        expect(query.mock.calls[0][2]).toEqual([17]);
        await repository.getByGithubLogin('oramm', conn);
        expect(query.mock.calls[1][2]).toEqual(['oramm']);
        await repository.list();
        expect(query.mock.calls[2][0]).toContain(
            'pa.SystemEmail AS systemEmail',
        );
        expect(query.mock.calls[2][0]).toContain('LEFT JOIN PersonAccounts');
        expect(query.mock.calls[2][0]).toContain('ORDER BY p.Surname, p.Name');
        query.mockResolvedValue([] as any);
        expect(await repository.getByPersonId(17)).toBeNull();
        expect(await repository.getByGithubLogin('oramm')).toBeNull();
    });
    it('konto osoby i kandydaci: parametry zamiast sklejania, role jako placeholdery', async () => {
        const query = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([{ personId: 5, isActive: 1, systemRoleName: 'ENVI_EMPLOYEE' }] as any);
        expect(await repository.getPersonAccount(5)).toMatchObject({ personId: 5, isActive: true });
        expect(query.mock.calls[0][2]).toEqual([5]);
        await repository.listInviteCandidates(["ENVI_EMPLOYEE", "X' OR 1=1"]);
        const [sql, , params] = query.mock.calls[1];
        expect(sql).toContain('sr.Name IN (?, ?)');
        expect(sql).toContain("s.StatusCode = 'REVOKED'");
        expect(sql).not.toContain('OR 1=1');
        expect(params).toEqual(["ENVI_EMPLOYEE", "X' OR 1=1"]);
        expect(await repository.listInviteCandidates([])).toEqual([]);
        expect(query).toHaveBeenCalledTimes(2);
        query.mockResolvedValue([] as any);
        expect(await repository.getPersonAccount(5)).toBeNull();
    });
});
