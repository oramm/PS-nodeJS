import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import ToolsDb from '../../tools/ToolsDb';
import SbAccessController from '../SbAccessController';
import SbAccessEventRepository from '../SbAccessEventRepository';
import SbAccessRepository from '../SbAccessRepository';
import SbAccessSecretRepository from '../SbAccessSecretRepository';
import SbAccessValidator from '../SbAccessValidator';
import SbGithubGateway from '../SbGithubGateway';
import { SbAccessError } from '../sbAccessPolicy';

const valid = { repos: 'write', psDb: 'ro', drive: 'connector', mail: ['faktury', 'chocianow-ik'] };

describe('Poziomy dostępu SB', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        // Hasła osoby (SBD-2): przy zmianie poziomów kontroler sprawdza, które wypadają.
        jest.spyOn(SbAccessSecretRepository.prototype, 'listByPersonId').mockResolvedValue([]);
        jest.spyOn(SbAccessSecretRepository.prototype, 'remove').mockResolvedValue([]);
    });

    it('migracja 003: kolumna Levels JSON NULL i akcja SET_LEVELS, bez sekretów', () => {
        const source = readFileSync(
            join(__dirname, '../migrations/003_sb_access_levels.sql'),
            'utf8',
        ).replace(/--[^\r\n]*/g, '');
        expect(source).toMatch(/ADD COLUMN IF NOT EXISTS Levels JSON NULL/);
        expect(source).toContain("'SET_LEVELS'");
        expect(source).not.toMatch(/UPDATE|DELETE|DROP/i);
    });

    it('walidator przyjmuje poprawne poziomy i brak poczty jako pustą listę', () => {
        expect(SbAccessValidator.parseLevels(valid)).toEqual(valid);
        expect(SbAccessValidator.parseLevels({ ...valid, mail: undefined }).mail).toEqual([]);
    });

    it.each([
        [{ ...valid, repos: 'admin' }],
        [{ ...valid, psDb: 'write' }],
        [{ ...valid, drive: 'read' }],
        [{ ...valid, mail: 'faktury' }],
        [{ ...valid, mail: ['Faktury'] }],
        [{ ...valid, mail: ['a/../b'] }],
        [{ ...valid, mail: ['x'.repeat(41)] }],
        [{ ...valid, mail: ['marek', 'marek'] }],
        [{ ...valid, mail: Array.from({ length: 21 }, (_, i) => `s${i}`) }],
        [null],
        [[]],
    ])('walidator odrzuca niepoprawne poziomy (400)', (body) => {
        expect(() => SbAccessValidator.parseLevels(body)).toThrow(SbAccessError);
    });

    it('brak albo uszkodzone Levels w bazie = wszystko none; JSON jako tekst i obiekt czytane', () => {
        const none = { repos: 'none', psDb: 'none', drive: 'none', mail: [] };
        expect(SbAccessValidator.levelsFromDb(null)).toEqual(none);
        expect(SbAccessValidator.levelsFromDb('{zepsuty')).toEqual(none);
        expect(SbAccessValidator.levelsFromDb(JSON.stringify(valid))).toEqual(valid);
        expect(SbAccessValidator.levelsFromDb(valid)).toEqual(valid);
    });

    it('repozytorium: odczyt wpisu niesie poziomy, zapis idzie parametrem na połączeniu', async () => {
        const conn = { threadId: 1 } as any;
        const select = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([{ id: 1, personId: 5, statusCode: 'ACTIVE', levels: null }] as any);
        const execute = jest.spyOn(ToolsDb, 'executeSQL').mockResolvedValue({} as any);
        const repository = new SbAccessRepository();
        expect((await repository.getByPersonId(5))!.levels.repos).toBe('none');
        expect(select.mock.calls[0][0]).toContain('s.Levels AS levels');

        select.mockResolvedValue([{ Id: 1 }] as any);
        expect(await repository.setLevels(conn, 5, valid as any)).toBe(true);
        expect(execute).toHaveBeenCalledWith(
            'UPDATE SbAccess SET Levels = ? WHERE PersonId = ?',
            [JSON.stringify(valid), 5],
            conn,
        );
        select.mockResolvedValue([] as any);
        expect(await repository.setLevels(conn, 6, valid as any)).toBe(false);
    });

    it('kontroler: zmiana poziomów zapisuje zdarzenie SET_LEVELS z ludzką uwagą w jednej transakcji', async () => {
        const conn = {} as any;
        jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (fn: any) => fn(conn));
        const set = jest.spyOn(SbAccessRepository.prototype, 'setLevels').mockResolvedValue(true);
        const append = jest
            .spyOn(SbAccessEventRepository.prototype, 'append')
            .mockResolvedValue(undefined);
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue({ personId: 5 } as any);
        await SbAccessController.setLevels(
            5,
            { repos: 'write', psDb: 'ro', drive: 'none', mail: ['faktury'] },
            1,
        );
        expect(set).toHaveBeenCalledWith(conn, 5, expect.objectContaining({ repos: 'write' }));
        expect(append).toHaveBeenCalledWith(conn, {
            personId: 5,
            actionCode: 'SET_LEVELS',
            resultCode: 'OK',
            requestedByPersonId: 1,
            note: 'repozytoria: zapis; baza PS: odczyt; Dysk: brak; poczta: faktury',
        });
    });

    it('kontroler: osoba bez wpisu -> 404 i brak zdarzenia', async () => {
        jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (fn: any) => fn({}));
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(null);
        const set = jest.spyOn(SbAccessRepository.prototype, 'setLevels').mockResolvedValue(false);
        const append = jest.spyOn(SbAccessEventRepository.prototype, 'append');
        await expect(SbAccessController.setLevels(9, valid as any, 1)).rejects.toMatchObject({ status: 404 });
        expect(append).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    describe('repozytoria: zapis = zespół GitHub z zapisem do repozytorium projektów', () => {
        const record = (statusCode: string, repos: string) =>
            ({ personId: 5, statusCode, githubLogin: 'ania-envi', levels: { ...valid, repos } }) as any;
        const run = async (state: any) => {
            process.env.SB_GITHUB_INVITE_TOKEN = 'atrapa';
            jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (fn: any) => fn({}));
            jest.spyOn(SbAccessRepository.prototype, 'setLevels').mockResolvedValue(true);
            jest.spyOn(SbAccessEventRepository.prototype, 'append').mockResolvedValue(undefined);
            jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(state);
            const add = jest.spyOn(SbGithubGateway.prototype, 'addTeamMember').mockResolvedValue(undefined);
            const remove = jest.spyOn(SbGithubGateway.prototype, 'removeTeamMember').mockResolvedValue(true);
            return { add, remove };
        };

        it('aktywna osoba z poziomem zapis trafia do zespołu sb-zespol', async () => {
            const { add, remove } = await run(record('ACTIVE', 'write'));
            await SbAccessController.setLevels(5, { ...valid, repos: 'write' } as any, 1);
            expect(add).toHaveBeenCalledWith('sb-zespol', 'ania-envi');
            expect(remove).not.toHaveBeenCalled();
        });

        it.each([
            ['ACTIVE', 'read'],
            ['ACTIVE', 'none'],
            ['BLOCKED', 'write'],
        ])('stan %s z poziomem %s = poza zespołem', async (status, repos) => {
            const { add, remove } = await run(record(status, repos));
            await SbAccessController.setLevels(5, { ...valid, repos } as any, 1);
            expect(remove).toHaveBeenCalledWith('sb-zespol', 'ania-envi');
            expect(add).not.toHaveBeenCalled();
        });

        it('błąd GitHuba: poziomy zostają zapisane, admin dostaje 502 z prośbą o ponowny zapis', async () => {
            const { add } = await run(record('ACTIVE', 'write'));
            add.mockRejectedValue(new Error('GitHub 403: Resource not accessible'));
            await expect(
                SbAccessController.setLevels(5, { ...valid, repos: 'write' } as any, 1),
            ).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Poziomy zapisane') });
            expect(SbAccessRepository.prototype.setLevels).toHaveBeenCalled();
        });
    });
});
