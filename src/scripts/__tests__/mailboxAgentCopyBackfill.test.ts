import { main } from '../mailboxAgentCopyBackfill';
import ToolsDb from '../../tools/ToolsDb';
import MailboxRepository, { MailboxRecord } from '../../mailboxes/MailboxRepository';
import MailboxController from '../../mailboxes/MailboxController';

jest.mock('../../setup/loadEnv', () => ({ loadEnv: jest.fn() }));
jest.mock('../../tools/ToolsDb');

const envKeys = ['DB_HOST', 'DIRECTADMIN_URL', 'DIRECTADMIN_LOGIN_USER', 'DIRECTADMIN_LOGIN_KEY', 'DIRECTADMIN_AGENT_COPY_ADDRESS'];
let original: (string | undefined)[];
let rows: MailboxRecord[];
let fetchMock: jest.SpyInstance;
beforeEach(() => {
    original = envKeys.map(key => process.env[key]);
    envKeys.forEach((key, index) => { process.env[key] = ['localhost', 'https://mail.example.test', 'user', 'key', 'sb-agent@envi.com.pl'][index]; });
    rows = [
        { id: 1, code: 'projekt', projectId: 10, contractId: null },
        { id: 2, code: 'kontrakt', projectId: null, contractId: 20 },
        { id: 3, code: 'faktury', projectId: null, contractId: null },
        { id: 4, code: 'nieaktywna', projectId: 11, contractId: null, statusCode: 'PENDING' },
        { id: 5, code: 'gotowa', projectId: 12, contractId: null, agentCopyStatus: 'SET' },
    ].map(row => ({ statusCode: 'ACTIVE', agentCopyStatus: 'PENDING', agentCopyLastError: null, address: `${row.code}@envi.com.pl`, ...row })) as MailboxRecord[];
    jest.spyOn(MailboxRepository.prototype, 'find').mockImplementation(async () => rows);
    jest.spyOn(MailboxRepository.prototype, 'get').mockImplementation(async id => rows.find(row => row.id === id));
    jest.spyOn(MailboxRepository.prototype, 'setAgentCopyState').mockImplementation(async (id, agentCopyStatus, agentCopyLastError) => {
        Object.assign(rows.find(row => row.id === id)!, { agentCopyStatus, agentCopyLastError });
    });
    (ToolsDb.transaction as jest.Mock).mockImplementation(async callback => callback({}));
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
        const action = new URLSearchParams(options?.body as string).get('action');
        return { ok: true, text: async () => action === 'list' ? '' : 'error=0' } as Response;
    });
});
afterEach(() => envKeys.forEach((key, i) => {
    if (original[i] === undefined) delete process.env[key];
    else process.env[key] = original[i];
}));

it('domyślnie tylko plan, bez poczty, transakcji i zapisu', async () => {
    await main();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
    expect(MailboxRepository.prototype.setAgentCopyState).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('[MBX] DRY-RUN: kopia dla projekt@envi.com.pl');
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('faktury@'));
});

it.each([false, true])('--apply: tylko ACTIVE/PENDING przypięte; include faktury=%s', async include => {
    await main(['--apply', ...(include ? ['--include=faktury'] : [])]);
    const creates = fetchMock.mock.calls.map(([, options]) => new URLSearchParams(options.body))
        .filter(body => body.get('action') === 'create').map(body => body.get('user'));
    expect(creates).toEqual(['projekt', 'kontrakt', ...(include ? ['faktury'] : [])]);
    expect(rows.map(row => row.agentCopyStatus)).toEqual(['SET', 'SET', include ? 'SET' : 'PENDING', 'PENDING', 'SET']);
    expect(fetchMock).toHaveBeenCalledTimes(include ? 6 : 4);
});

it('import i dry-run z include nie uruchamiają uzupełnienia', async () => {
    const copy = jest.spyOn(MailboxController, 'agentCopy');
    await main(['--include=faktury']);
    expect(copy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('[MBX] DRY-RUN: kopia dla faktury@envi.com.pl');
});

it.each([['--aply'], ['--apply', '--dry-run'], ['--include='], ['--include=bad@envi.com.pl']])('odrzuca błędne parametry %j przed odczytem i siecią', async (...args) => {
    await expect(main(args)).rejects.toThrow('Użycie');
    expect(MailboxRepository.prototype.find).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
});

it('zapis do zdalnej bazy wymaga jawnego wyboru', async () => {
    process.env.DB_HOST = 'remote.example.test';
    await expect(main(['--apply'])).rejects.toThrow('--prod');
    expect(fetchMock).not.toHaveBeenCalled();
});
