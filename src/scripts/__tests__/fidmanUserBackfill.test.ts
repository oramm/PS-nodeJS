import { main, userBackfillRecipients } from '../fidmanUserBackfill';
import ToolsDb from '../../tools/ToolsDb';
import PersonRepository from '../../persons/PersonRepository';
import { enqueueFidmanUserPush } from '../../contracts/fidmanSync/FidmanSync';

jest.mock('../../tools/ToolsDb');
jest.mock('../../setup/loadEnv', () => ({ loadEnv: jest.fn() }));
jest.mock('../../contracts/fidmanSync/FidmanSync', () => ({
    ...jest.requireActual('../../contracts/fidmanSync/FidmanSync'),
    enqueueFidmanUserPush: jest.fn(),
}));

const envKeys = ['DB_HOST', 'FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN'];
const originals = envKeys.map((key) => process.env[key]);
beforeEach(() => {
    process.env.DB_HOST = 'localhost';
    process.env.FIN_SYNC_BASE_URL = 'https://fin.invalid';
    process.env.FIN_SYNC_TOKEN = 'test';
});
afterEach(() => envKeys.forEach((key, i) => {
    if (originals[i] === undefined) delete process.env[key];
    else process.env[key] = originals[i];
}));

it.each([
    [[], ['fidman']],
    [['--recipient=fidman'], ['fidman']],
    [['--recipient=fin'], ['fin']],
    [['--recipient=all'], ['fidman', 'fin']],
])('wybór odbiorców %j', (args, expected) => {
    expect(userBackfillRecipients(args)).toEqual(expected);
});
it.each([['--recipient=other'], ['--recipient=fin', '--recipient=all']])('odrzuca błędny wybór %j', (...args) => {
    expect(() => userBackfillRecipients(args)).toThrow('Odbiorca');
});

it.each(['fidman', 'fin', 'all'])('backfill %s czyta każdy zbiór po własnej fladze', async (recipient) => {
    const conn = { query: jest.fn(async (sql: string) => [[{ PersonId: sql.includes('FinEnabled') ? 2 : 1 }]]) };
    (ToolsDb.transaction as jest.Mock).mockImplementation((callback) => callback(conn));
    jest.spyOn(PersonRepository.prototype, 'getFidmanUserSourceInConn').mockImplementation(async (_conn, personId) => ({
        personId, entityId: personId === 1 ? 7 : null, name: 'Anna', surname: 'Testowa', systemEmail: 'anna@envi.com.pl', systemRoleName: null, cellphone: null,
    }));
    await main([`--recipient=${recipient}`, '--apply']);
    const recipients = userBackfillRecipients([`--recipient=${recipient}`]);
    expect(conn.query.mock.calls.map(([sql]) => sql)).toEqual(recipients.map((r) => `SELECT PersonId FROM PersonAccounts WHERE ${r === 'fin' ? 'FinEnabled' : 'FidmanEnabled'} = 1`));
    expect((enqueueFidmanUserPush as jest.Mock).mock.calls.map((call) => [call[0].personId, call[3]])).toEqual(recipients.map((r) => [r === 'fin' ? 2 : 1, r]));
});

it.each(['fin', 'all'])('backfill %s bez konfiguracji FIN odmawia przed DB', async (recipient) => {
    delete process.env.FIN_SYNC_TOKEN;
    await expect(main([`--recipient=${recipient}`])).rejects.toThrow('[FIN] Wymagane FIN_SYNC_BASE_URL i FIN_SYNC_TOKEN');
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});
