import ToolsGapi from '../ToolsGapi';
import ToolsDb from '../../../tools/ToolsDb';
import PersonRepository from '../../../persons/PersonRepository';

describe('ToolsGapi P3-B first consumer migration', () => {
    const originalSessionsFlag = process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED;
    const originalWriteDualFlag = process.env.PERSONS_MODEL_V2_WRITE_DUAL;

    beforeEach(() => {
        jest.restoreAllMocks();
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED = 'false';
        process.env.PERSONS_MODEL_V2_WRITE_DUAL = 'false';
    });

    afterAll(() => {
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED = originalSessionsFlag;
        process.env.PERSONS_MODEL_V2_WRITE_DUAL = originalWriteDualFlag;
    });

    it('keeps legacy Persons write path when sessions migration flag is OFF and dual-write is OFF', async () => {
        const editInDbSpy = jest
            .spyOn(ToolsDb, 'editInDb')
            .mockResolvedValue(undefined as any);
        const transactionSpy = jest.spyOn(ToolsDb, 'transaction');
        const upsertSpy = jest.spyOn(
            PersonRepository.prototype,
            'upsertPersonAccountInDb'
        );

        await ToolsGapi.editUserGoogleIdInDb(101, 'google-101');

        expect(editInDbSpy).toHaveBeenCalledWith('Persons', {
            id: 101,
            googleId: 'google-101',
        });
        expect(transactionSpy).not.toHaveBeenCalled();
        expect(upsertSpy).not.toHaveBeenCalled();
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
            ['googleRefreshToken']
        );
    });

    it('preserves existing dual-write path when sessions migration flag is OFF and dual-write is ON', async () => {
        process.env.PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED = 'false';
        process.env.PERSONS_MODEL_V2_WRITE_DUAL = 'true';

        const editInDbSpy = jest
            .spyOn(ToolsDb, 'editInDb')
            .mockResolvedValue(undefined as any);
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined as any);
        const transactionSpy = jest
            .spyOn(ToolsDb, 'transaction')
            .mockImplementation(async (callback: any) => callback({}));

        await ToolsGapi.editUserGoogleIdInDb(303, 'google-303');

        expect(editInDbSpy).not.toHaveBeenCalled();
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            {
                id: 303,
                googleId: 'google-303',
                googleRefreshToken: undefined,
                microsoftId: undefined,
                microsoftRefreshToken: undefined,
            },
            {},
            ['googleId']
        );
    });
});
