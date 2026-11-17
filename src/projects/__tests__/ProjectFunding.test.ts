import mysql from 'mysql2/promise';
import Project from '../Project';
import ProjectRepository from '../ProjectRepository';
import ProjectValidator from '../ProjectValidator';
import ProjectsController from '../ProjectsController';
import ToolsDb from '../../tools/ToolsDb';

describe('SPR-P dane dofinansowania projektu (bez bazy)', () => {
    beforeEach(() => {
        jest.spyOn(mysql, 'createPool').mockImplementation(() => {
            throw new Error('Test nie może otwierać bazy');
        });
    });

    it.each(['fundingAgreementNumber', 'program'])('%s: trim, 50 znaków, pusty/null i błędny typ', (field) => {
        const normalize = (value: unknown) => ProjectValidator.normalizeFundingFields({ [field]: value });
        expect(normalize(` ${'ą'.repeat(50)} `)[field]).toBe('ą'.repeat(50));
        expect(normalize('😀'.repeat(50))[field]).toBe('😀'.repeat(50));
        expect(normalize('  ')[field]).toBeNull();
        expect(normalize(null)[field]).toBeNull();
        expect(() => normalize('a'.repeat(51))).toThrow('maksymalnie 50 znaków');
        for (const value of [{}, [], undefined]) {
            expect(() => normalize(value)).toThrow('musi być tekstem lub null');
        }
        expect(ProjectValidator.normalizeFundingFields({})).not.toHaveProperty(field);
    });

    it.each(['fundingAgreementNumber', 'program'] as const)('%s: liczby i boolean zapisuje jako tekst', async (field) => {
        for (const [value, text] of [[2021, '2021'], [12345, '12345'], [true, 'true'], [false, 'false'], [1.5, '1.5']] as const) {
            const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 7 }]) } as any;
            const project = new Project(ProjectValidator.normalizeFundingFields({ [field]: value }));
            expect(project[field]).toBe(text);
            await new ProjectRepository().addInDb(project, conn, true);
            expect(conn.execute.mock.calls[0][1]).toEqual([text]);
        }
    });

    it.each(['addFromDto', 'editFromDto'] as const)('%s waliduje przed efektami ubocznymi', async (method) => {
        await expect(ProjectsController[method]({ program: 'x'.repeat(51) })).rejects.toThrow('maksymalnie 50 znaków');
        for (const field of ['program', 'fundingAgreementNumber']) {
            await expect(ProjectsController[method]({ [field]: 'x'.repeat(51) })).rejects.toMatchObject({ status: 400 });
        }
    });

    it('INSERT zapisuje znormalizowane pola, UPDATE bez kluczy nie zawiera nowych kolumn', async () => {
        const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 7 }]) } as any;
        const repo = new ProjectRepository();
        const project = new Project(ProjectValidator.normalizeFundingFields({ ourId: 'P1', name: 'Projekt', fundingAgreementNumber: ' UD/1 ', program: ' FEnIKS ' }));
        await repo.addInDb(project, conn, true);
        expect(conn.execute.mock.calls[0][0]).toContain('`FundingAgreementNumber`');
        expect(conn.execute.mock.calls[0][0]).toContain('`Program`');
        expect(conn.execute.mock.calls[0][1]).toEqual(expect.arrayContaining(['UD/1', 'FEnIKS']));

        await repo.editInDb(new Project({ id: 7, ourId: 'P1', name: 'Stary formularz' }), conn, true);
        const sql = conn.execute.mock.calls[1][0];
        expect(sql).not.toContain('FundingAgreementNumber');
        expect(sql).not.toContain('Program');

        await repo.editInDb(new Project(ProjectValidator.normalizeFundingFields({ id: 7, fundingAgreementNumber: '', program: ' ' })), conn, true);
        expect(conn.execute.mock.calls[2][0]).toContain('`FundingAgreementNumber`=?');
        expect(conn.execute.mock.calls[2][0]).toContain('`Program`=?');
        expect(conn.execute.mock.calls[2][1]).toEqual([null, null, 7]);
    });

    it('SELECT mapuje obie kolumny na API projektu', async () => {
        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue([{ Id: 7, OurId: 'P1', FundingAgreementNumber: 'UD/1', Program: 'FEnIKS' }] as any);
        const [project] = await new ProjectRepository().find([{ id: 7 }]);
        expect(project).toMatchObject({ fundingAgreementNumber: 'UD/1', program: 'FEnIKS' });
        expect((ToolsDb.getQueryCallbackAsync as jest.Mock).mock.calls[0][0]).toContain('Projects.FundingAgreementNumber');
    });

    it('zapis nie konwertuje tekstu na datę ani nie dodaje znaków escape', async () => {
        const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 7 }]) } as any;
        const repo = new ProjectRepository();
        const project = new Project(ProjectValidator.normalizeFundingFields({ id: 7, fundingAgreementNumber: '12-06-2018', program: "'".repeat(50) }));
        await repo.addInDb(project, conn, true);
        expect(conn.execute.mock.calls[0][1]).toEqual(['12-06-2018', "'".repeat(50)]);
        await repo.editInDb(project, conn, true);
        expect(conn.execute.mock.calls[1][1]).toEqual(['12-06-2018', "'".repeat(50), 7]);
    });

    it('brak projektu w bazie jest błędem, bez powrotu do danych formularza', async () => {
        const conn = { query: jest.fn().mockResolvedValue([[]]) } as any;
        await expect(new ProjectRepository().findForContract(7, conn)).rejects.toThrow('Nie znaleziono projektu umowy 7');
    });
});
