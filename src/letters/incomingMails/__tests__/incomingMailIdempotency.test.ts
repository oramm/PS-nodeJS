import { SystemRoleName, UserData } from '../../../types/sessionTypes';

jest.mock('../../../tools/ToolsDb');
jest.mock('../../../persons/PersonsController');

import ToolsDb from '../../../tools/ToolsDb';
import PersonsController from '../../../persons/PersonsController';
import IncomingMail from '../IncomingMail';
import IncomingMailsController from '../IncomingMailsController';

/**
 * Idempotencja skanu skrzynki stoi na jednym `UNIQUE (MessageId)` i na tym, że duplikat klucza
 * jest normalnym wynikiem, a nie awarią. Jeśli to się zepsuje — czy przez zdjęcie ograniczenia,
 * czy przez połknięcie błędu jako sukcesu — powtórzony skan założy drugą kopertę i drugie pismo.
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

const MESSAGE_ID = '<zapytanie-2026-07-31@nadawca.example>';

function makeMail() {
    return new IncomingMail({
        messageId: MESSAGE_ID,
        account: 'envi',
        subject: 'Zapytanie o termin',
        body: 'Treść wiadomości',
        from: 'nadawca@example.com',
        to: 'marek@envi.com.pl',
        date: '2026-07-31 09:15:00',
    });
}

/** Błąd, którym MariaDB odpowiada na powtórzony MessageId */
function duplicateEntryError() {
    return Object.assign(new Error('Duplicate entry'), {
        code: 'ER_DUP_ENTRY',
        errno: 1062,
    });
}

beforeEach(() => {
    (PersonsController.getPersonFromSessionUserData as jest.Mock).mockResolvedValue(
        { id: 614, name: 'Agent', surname: 'PS' }
    );
});

test('pierwsza rejestracja maila zakłada kopertę', async () => {
    (ToolsDb.addInDb as jest.Mock).mockImplementation(async (_table, object) => {
        object.id = 41;
        return object;
    });

    const result = await IncomingMailsController.register(makeMail(), USER);

    expect(result.isNew).toBe(true);
    expect(result.mail.id).toBe(41);
    expect(result.mail.editorId).toBe(614);
});

test('powtórzony mail nie zakłada drugiej koperty i wraca jako pominięcie', async () => {
    (ToolsDb.addInDb as jest.Mock).mockRejectedValue(duplicateEntryError());
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([
        {
            Id: 41,
            MessageId: MESSAGE_ID,
            Account: 'envi',
            Subject: 'Zapytanie o termin',
            Body: 'Treść wiadomości',
            From: 'nadawca@example.com',
            To: 'marek@envi.com.pl',
            Date: '2026-07-31 09:15:00',
            EditorId: 614,
            LastUpdated: '2026-07-31 09:20:00',
            LettersCount: 1,
        },
    ]);

    const result = await IncomingMailsController.register(makeMail(), USER);

    // isNew=false to sygnał dla wywołującego, żeby NIE rejestrował pisma drugi raz
    expect(result.isNew).toBe(false);
    expect(result.mail.id).toBe(41);
    expect(result.mail._lettersCount).toBe(1);
});

test('data bez strefy trafia do bazy dosłownie, bez przesunięcia o offset maszyny', () => {
    expect(IncomingMail.toSqlDateTime('2026-07-31 09:15:00')).toBe(
        '2026-07-31 09:15:00'
    );
    expect(IncomingMail.toSqlDateTime('2026-07-31T09:15:00.000Z')).toBe(
        '2026-07-31 09:15:00'
    );
});

test('błąd inny niż duplikat klucza nie udaje pominięcia', async () => {
    (ToolsDb.addInDb as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Connection lost'), { errno: 2013 })
    );

    await expect(
        IncomingMailsController.register(makeMail(), USER)
    ).rejects.toThrow('Connection lost');
});
