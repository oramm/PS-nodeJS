import { SystemRoleName, UserData } from '../../../types/sessionTypes';

jest.mock('../../../tools/ToolsDb');
jest.mock('../../../persons/PersonsController');

import ToolsDb from '../../../tools/ToolsDb';
import PersonsController from '../../../persons/PersonsController';
import MailScansController from '../MailScansController';

/**
 * Znacznik skanu ma dokładnie dwa sposoby, żeby po cichu zjeść pocztę: cofnąć się (odsłania
 * przerobione maile — tanie) albo wyskoczyć w przyszłość (zjada nieprzeczytane — nieodwracalne
 * i nikt się nie dowie). Obie reguły siedzą w jednym zapytaniu, bo muszą przetrwać dwa równoległe
 * przebiegi z dwóch kont. Ten test pilnuje, żeby ktoś nie zamienił upsertu na SELECT + UPDATE
 * w aplikacji; że reguły działają na żywej bazie, dowodzi przebieg opisany w progress, nie ten plik.
 */

const USER: UserData = {
    enviId: 614,
    googleId: 'g-614',
    systemEmail: 'agent@ps.envi.com.pl',
    userName: 'Agent PS',
    picture: '',
    systemRoleName: SystemRoleName.ENVI_EMPLOYEE,
    systemRoleId: 3,
} as UserData;

function sqlOfCall(index: number): string {
    return (ToolsDb.getQueryCallbackAsync as jest.Mock).mock.calls[index][0];
}

beforeEach(() => {
    jest.clearAllMocks();
    (
        PersonsController.getPersonFromSessionUserData as jest.Mock
    ).mockResolvedValue({ id: 614, name: 'Agent', surname: 'PS' });
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([
        {
            Id: 1,
            Account: 'envi',
            Mailbox: 'INBOX',
            ScannedUntil: '2026-08-01 10:00:00',
            LastRunAt: '2026-08-01 10:05:00',
            EditorId: 614,
        },
    ]);
});

test('znacznik nie cofa się i nie wyskakuje w przyszłość', async () => {
    await MailScansController.advance(
        {
            account: 'envi',
            mailbox: 'INBOX',
            scannedUntil: '2026-08-01 10:00:00',
        },
        USER
    );

    const sql = sqlOfCall(0);
    // sufit „teraz": granica wchodzi z nagłówka Date wiadomości, czyli od nadawcy
    expect(sql).toMatch(/LEAST\(\s*'2026-08-01 10:00:00',\s*NOW\(\)\s*\)/);
    // brak cofania: spóźniony przebieg nie nadpisze nowszego znacznika
    expect(sql).toMatch(/GREATEST\(\s*MailScans\.ScannedUntil/);
    // rozstrzyga baza, nie aplikacja — inaczej dwa równoległe przebiegi wygrywają na przemian
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
});

test('granica okna bez strefy trafia do bazy dosłownie', async () => {
    await MailScansController.advance(
        {
            account: 'envi',
            mailbox: 'INBOX',
            scannedUntil: '2026-08-01T10:00',
        },
        USER
    );

    expect(sqlOfCall(0)).toContain("'2026-08-01 10:00:00'");
});

test('przebieg bez granicy okna nie zapisuje nic', async () => {
    await expect(
        MailScansController.advance(
            { account: 'envi', mailbox: 'INBOX', scannedUntil: '' },
            USER
        )
    ).rejects.toThrow('scannedUntil');

    expect(ToolsDb.getQueryCallbackAsync as jest.Mock).not.toHaveBeenCalled();
});

test('przebieg bez wskazanej skrzynki nie zapisuje nic', async () => {
    await expect(
        MailScansController.advance(
            {
                account: '',
                mailbox: 'INBOX',
                scannedUntil: '2026-08-01 10:00:00',
            },
            USER
        )
    ).rejects.toThrow('account');

    expect(ToolsDb.getQueryCallbackAsync as jest.Mock).not.toHaveBeenCalled();
});
