import ToolsGapi from '../ToolsGapi';
import ToolsDb from '../../../tools/ToolsDb';
import PersonRepository from '../../../persons/PersonRepository';

describe('ToolsGapi P3-B first consumer migration', () => {
    const originalSessionsFlag =
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED;

    beforeEach(() => {
        jest.restoreAllMocks();
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED = 'false';
    });

    afterAll(() => {
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED =
            originalSessionsFlag;
    });

    it('freezes legacy Persons write path and updates account via PersonAccounts when both flags are OFF', async () => {
        const editInDbSpy = jest
            .spyOn(ToolsDb, 'editInDb')
            .mockResolvedValue(undefined as any);
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined as any);
        const transactionSpy = jest.spyOn(ToolsDb, 'transaction');
        transactionSpy.mockImplementation(async (callback: any) =>
            callback({}),
        );

        await ToolsGapi.editUserGoogleIdInDb(101, 'google-101');

        expect(editInDbSpy).not.toHaveBeenCalled();
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            {
                id: 101,
                googleId: 'google-101',
                googleRefreshToken: undefined,
                microsoftId: undefined,
                microsoftRefreshToken: undefined,
            },
            {},
            ['googleId'],
        );
    });

    it('uses v2 account write path when sessions migration flag is ON', async () => {
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED = 'true';

        const editInDbSpy = jest
            .spyOn(ToolsDb, 'editInDb')
            .mockResolvedValue(undefined as any);
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined as any);
        const transactionSpy = jest
            .spyOn(ToolsDb, 'transaction')
            .mockImplementation(async (callback: any) => callback({}));

        await ToolsGapi.editUserGoogleRefreshTokenInDb(202, 'token-202');

        expect(editInDbSpy).not.toHaveBeenCalled();
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            {
                id: 202,
                googleId: undefined,
                googleRefreshToken: 'token-202',
                microsoftId: undefined,
                microsoftRefreshToken: undefined,
            },
            {},
            ['googleRefreshToken'],
        );
    });
});
