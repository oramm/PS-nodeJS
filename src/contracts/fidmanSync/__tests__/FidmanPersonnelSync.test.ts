import fs from 'fs';
import path from 'path';

jest.mock('../../../tools/ToolsDb');
import ToolsDb from '../../../tools/ToolsDb';
import {
    buildContractPersonnelPayload, enqueueFidmanContractPush,
    enqueueFidmanPersonnelForRoles, findFidmanPersonnelContracts,
    drainFidmanOutbox,
} from '../FidmanSync';

const person = { PersonId: 7, FirstName: 'Jan', LastName: 'Kowalski', Email: 'jan@envi.pl', RoleName: 'Inspektor', GroupName: 'Inżynier' };

describe('WNM-2 personel', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    function connection(project = 'PRJ.1', roles: any[] = []) {
        return {
            query: jest.fn(async (sql: string, params: any[]) => {
                expect(params).toEqual([42]);
                expect(sql).toContain('r.ContractId IS NULL');
                expect(sql).toContain('LEFT(c.ProjectOurId, 6)');
                expect(sql).toContain('p.Email');
                const selected = roles.filter((r) => (r.ContractId === 42 && !r.ProjectOurId?.startsWith('ROZNE.')) ||
                    (r.ContractId == null && r.ProjectOurId === project && !project.startsWith('ROZNE.')));
                return [selected.map((r) => ({ ...person, ...r }))];
            }),
            execute: jest.fn(async () => [{ insertId: 88 }]),
        } as any;
    }

    it('rozwija rolę projektu, uwzględnia umowę i wszystkie grupy', async () => {
        const conn = connection('PRJ.1', [
            { ContractId: null, ProjectOurId: 'PRJ.1' },
            ...['Zamawiający', 'Wykonawca/Podwykonawcy', 'Pozostali'].map((GroupName, i) =>
                ({ ContractId: 42, PersonId: i + 20, GroupName })),
            { ContractId: 99, ProjectOurId: 'PRJ.1' },
        ]);
        const result = await buildContractPersonnelPayload(42, conn);
        expect(result.kind).toBe('contract.personnel');
        expect(result.payload.legacyContractId).toBe(42);
        expect(result.payload.personnel).toHaveLength(4);
        expect(result.payload.personnel[0]).toEqual({ psPersonId: 7, firstName: 'Jan', lastName: 'Kowalski', email: 'jan@envi.pl', roleName: 'Inspektor', group: 'Inżynier' });
    });

    it('dołącza adres logowania aktywnego konta niezależnie od adresu kontaktowego', async () => {
        const conn = connection('PRJ.1', [{ ContractId: 42, LoginEmail: '  google@envi.pl  ' }]);
        const result = await buildContractPersonnelPayload(42, conn);
        expect(result.payload.personnel[0]).toEqual({
            psPersonId: 7, firstName: 'Jan', lastName: 'Kowalski',
            email: 'jan@envi.pl', loginEmail: 'google@envi.pl', roleName: 'Inspektor', group: 'Inżynier',
        });
        const sql = conn.query.mock.calls[0][0];
        expect(sql).toContain('pa.SystemEmail AS LoginEmail');
        expect(sql).toContain('LEFT JOIN PersonAccounts pa ON pa.PersonId = p.Id AND pa.IsActive = 1');
        expect(sql).not.toContain('pa.FidmanEnabled');
    });

    it.each([undefined, null, '', 'bad', 'a@b.c', 'x'.repeat(91) + '@ab.cd', 'a b@envi.pl'])
        ('brak lub niepoprawny loginEmail %j pomija tylko opcjonalne pole', async (LoginEmail) => {
            const result = await buildContractPersonnelPayload(42, connection('PRJ.1', [{ ContractId: 42, LoginEmail }]));
            expect(result.payload.personnel).toHaveLength(1);
            expect(result.payload.personnel[0]).not.toHaveProperty('loginEmail');
            expect(result.payload.personnel[0].email).toBe('jan@envi.pl');
        });

    it.each(['a@b.cd', 'x'.repeat(90) + '@ab.cd'])('akceptuje graniczną długość loginEmail %j', async (LoginEmail) => {
        const result = await buildContractPersonnelPayload(42, connection('PRJ.1', [{ ContractId: 42, LoginEmail }]));
        expect(result.payload.personnel[0].loginEmail).toBe(LoginEmail);
    });

    it.each(['ROZNE.01', 'ZBS.ROZNE.01.PLAD'])('sprawdza tylko przedrostek %s', async (project) => {
        const result = await buildContractPersonnelPayload(42, connection(project, [{ ContractId: null, ProjectOurId: project }]));
        expect(result.payload.personnel).toHaveLength(project.startsWith('ROZNE.') ? 0 : 1);
    });

    it('pomija projektowe kopie ROZNE., zachowuje rolę przypiętą wyłącznie do umowy', async () => {
        const result = await buildContractPersonnelPayload(42, connection('ROZNE.1', [
            { ContractId: 42, ProjectOurId: 'ROZNE.1' },
            { ContractId: 42, PersonId: 8 },
        ]));
        expect(result.payload.personnel.map((p) => p.psPersonId)).toEqual([8]);
    });

    it('deduplikuje osobę i nazwę roli, pozostawia inne role tej osoby', async () => {
        const result = await buildContractPersonnelPayload(42, connection('PRJ.1', [
            { ContractId: 42 }, { ContractId: null, ProjectOurId: 'PRJ.1' },
            { ContractId: 42, RoleName: 'Kierownik' },
        ]));
        expect(result.payload.personnel.map((p) => p.roleName)).toEqual(['Inspektor', 'Kierownik']);
    });

    it('wysyła pustą listę po usunięciu ostatniej roli', async () => {
        expect((await buildContractPersonnelPayload(42, connection())).payload).toEqual({ legacyContractId: 42, personnel: [] });
    });

    it.each([
        { Email: null }, { Email: '' }, { Email: 'bad' }, { Email: 'a'.repeat(97) },
        { FirstName: '' }, { FirstName: 'a'.repeat(64) }, { LastName: 'a'.repeat(33) },
        { RoleName: '' }, { RoleName: 'a'.repeat(101) }, { GroupName: 'Obcy' }, { PersonId: 1.5 },
    ])('pomija niepoprawny wiersz %j z ostrzeżeniem', async (invalid) => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await buildContractPersonnelPayload(42, connection('PRJ.1', [
            { ContractId: 42, ...invalid }, { ContractId: 42, PersonId: 8 },
        ]));
        expect(result.payload.personnel.map((p) => p.psPersonId)).toEqual([8]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('kwalifikuje tylko typ z allowlisty i włączony znacznik, deduplikuje umowy', async () => {
        const conn: any = { query: jest.fn(async () => [[
            { Id: 42, TypeId: 3, FidmanSyncEnabled: 1 },
            { Id: 42, TypeId: 3, FidmanSyncEnabled: 1 },
            { Id: 43, TypeId: 4, FidmanSyncEnabled: 0 },
            { Id: 44, TypeId: 99, FidmanSyncEnabled: 1 },
        ]]) };
        expect(await findFidmanPersonnelContracts([
            { ContractId: 42, ProjectOurId: 'PRJ.1' },
            { ContractId: null, ProjectOurId: 'PRJ.2' },
            { ContractId: null, ProjectOurId: 'ROZNE.1' },
        ], conn)).toEqual([42]);
        expect(conn.query.mock.calls[0][1]).toEqual([42, 'PRJ.2']);
    });

    it('projekt zbiorczy i brak zakresu nie wykonują zapytania', async () => {
        const conn: any = { query: jest.fn() };
        expect(await findFidmanPersonnelContracts([{ ContractId: null, ProjectOurId: 'ROZNE.1' }], conn)).toEqual([]);
        expect(conn.query).not.toHaveBeenCalled();
    });

    it('kolejkuje pełną migawkę na tym samym połączeniu po contract.upsert', async () => {
        const conn = connection();
        let id = 80;
        conn.execute.mockImplementation(async () => [{ insertId: ++id }]);
        expect(await enqueueFidmanContractPush({ id: 42 } as any, conn)).toBe(81);
        expect(conn.execute.mock.calls.map((call: any) => call[1][0])).toEqual(['contract.upsert', 'contract.personnel']);
        expect(JSON.parse(conn.execute.mock.calls[1][1][2])).toEqual({ legacyContractId: 42, personnel: [] });
    });

    it('nie tworzy personelu przy odmowie kwalifikacji umowy', async () => {
        const conn: any = { query: jest.fn(async () => [[{ Id: 42, TypeId: 3, FidmanSyncEnabled: 0 }]]), execute: jest.fn() };
        expect(await enqueueFidmanPersonnelForRoles([{ ContractId: 42, ProjectOurId: null }], conn)).toEqual([]);
        expect(conn.execute).not.toHaveBeenCalled();
    });

    it('drain odczytuje kolejkę rosnąco po Id', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        await drainFidmanOutbox();
        expect((ToolsDb.getQueryCallbackAsync as any).mock.calls[0][0]).toMatch(/ORDER BY Id ASC/);
    });

    it('014 zachowuje pełny ENUM z 010, dopisuje personel i zachowuje NOT NULL bez DEFAULT', () => {
        const dir = path.resolve(__dirname, '../../migrations');
        const old = fs.readFileSync(path.join(dir, '010_add_user_upsert_kind_to_fidman_sync_outbox.sql'), 'utf8');
        const current = fs.readFileSync(path.join(dir, '014_add_contract_personnel_kind_to_fidman_sync_outbox.sql'), 'utf8');
        const values = (sql: string) => [...sql.match(/ENUM\(([\s\S]*?)\)/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect(values(current)).toEqual([...values(old), 'contract.personnel']);
        expect(current).toMatch(/MODIFY COLUMN Kind/);
        expect(current).toMatch(/\) NOT NULL/);
        expect(current).not.toMatch(/DEFAULT/);
    });
});
