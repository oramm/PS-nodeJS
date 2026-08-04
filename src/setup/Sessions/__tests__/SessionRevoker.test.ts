import SessionRevoker from '../SessionRevoker';

const deleteMany = jest.fn();
const close = jest.fn();
const connect = jest.fn();

jest.mock('mongodb', () => ({
    MongoClient: jest.fn().mockImplementation(() => ({
        connect,
        close,
        db: () => ({ collection: () => ({ deleteMany }) }),
    })),
}));

jest.mock('../credentials', () => ({ keys: { mongoDb: { uri: undefined } } }));

describe('SessionRevoker', () => {
    const ORIGINAL_URI = process.env.MONGO_URI;

    beforeEach(() => {
        process.env.MONGO_URI = 'mongodb://localhost:27017/test';
        connect.mockResolvedValue(undefined);
        close.mockResolvedValue(undefined);
        deleteMany.mockResolvedValue({ deletedCount: 2 });
    });

    afterAll(() => {
        process.env.MONGO_URI = ORIGINAL_URI;
    });

    it('kasuje sesje wskazanej osoby i zwraca ich liczbę', async () => {
        const deleted = await SessionRevoker.revokeForPerson(608);

        expect(deleted).toBe(2);
        expect(deleteMany).toHaveBeenCalledWith({
            session: { $regex: '"enviId":608[,}]' },
        });
    });

    it('domyka wzorzec przecinkiem lub klamrą - enviId 12 nie może złapać 123', async () => {
        await SessionRevoker.revokeForPerson(12);

        const pattern = deleteMany.mock.calls[0][0].session.$regex as string;
        expect(new RegExp(pattern).test('"enviId":12,"googleId":"x"')).toBe(
            true
        );
        expect(new RegExp(pattern).test('"enviId":123,"googleId":"x"')).toBe(
            false
        );
    });

    it('nie daje się nabrać na pole o podobnej nazwie', async () => {
        await SessionRevoker.revokeForPerson(608);

        const pattern = deleteMany.mock.calls[0][0].session.$regex as string;
        expect(new RegExp(pattern).test('"xenviId":608,')).toBe(false);
    });

    it('zamyka połączenie także wtedy, gdy zapytanie się wywali', async () => {
        deleteMany.mockRejectedValue(new Error('mongo padło'));

        // Unieważnienie sesji jest skutkiem ubocznym zapisu roli - nie może go wywrócić.
        await expect(SessionRevoker.revokeForPerson(608)).resolves.toBe(0);
        expect(close).toHaveBeenCalled();
    });

    it('ignoruje niepoprawny identyfikator, zanim tknie bazę', async () => {
        expect(await SessionRevoker.revokeForPerson(0)).toBe(0);
        expect(await SessionRevoker.revokeForPerson(-5)).toBe(0);
        expect(await SessionRevoker.revokeForPerson(NaN)).toBe(0);

        expect(connect).not.toHaveBeenCalled();
    });

    it('bez MONGO_URI nie wywala się, tylko zgłasza problem', async () => {
        delete process.env.MONGO_URI;

        expect(await SessionRevoker.revokeForPerson(608)).toBe(0);
        expect(connect).not.toHaveBeenCalled();
    });
});
