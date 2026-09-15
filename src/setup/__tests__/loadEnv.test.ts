import {
    assertDevSessionStoreIsolated,
    describeMongoTarget,
    parseMongoHostAndDb,
} from '../loadEnv';

const PROD_URI = 'mongodb+srv://user:haslo@cluster0.yca9wrm.mongodb.net/?retryWrites=true';

describe('assertDevSessionStoreIsolated', () => {
    it('blokuje dev, gdy MONGO_URI spadlo do wartosci z .env', () => {
        expect(() =>
            assertDevSessionStoreIsolated('development', PROD_URI, PROD_URI),
        ).toThrow(/ten sam magazyn sesji co produkcja/);
    });

    // ROD-0: rzeczywisty stan laptopa 2026-09-07 — .env ma koncowy `/`, .env.development nie.
    // Stringi rozne, ale ten sam klaster i baza. Poprzedni straznik (porownanie calego napisu)
    // to przepuszczal; ten musi zablokowac.
    it('blokuje dev rozniacy sie od produkcji tylko koncowym ukosnikiem', () => {
        const prod = 'mongodb+srv://user:haslo@cluster0.yca9wrm.mongodb.net/?retryWrites=true&w=majority/';
        const dev = 'mongodb+srv://user:haslo@cluster0.yca9wrm.mongodb.net/?retryWrites=true&w=majority';
        expect(() =>
            assertDevSessionStoreIsolated('development', dev, prod),
        ).toThrow(/ten sam magazyn sesji co produkcja/);
    });

    it('blokuje dev z innym loginem/haslem, ale tym samym hostem i baza', () => {
        const prod = 'mongodb+srv://admin:tajne@cluster0.yca9wrm.mongodb.net/?retryWrites=true';
        const dev = 'mongodb+srv://readonly:inne@cluster0.yca9wrm.mongodb.net/?w=majority';
        expect(() =>
            assertDevSessionStoreIsolated('development', dev, prod),
        ).toThrow(/ten sam magazyn sesji co produkcja/);
    });

    it('przepuszcza dev z wlasnym MONGO_URI (inny host)', () => {
        expect(() =>
            assertDevSessionStoreIsolated(
                'development',
                'mongodb://localhost:27017/ps_dev',
                PROD_URI,
            ),
        ).not.toThrow();
    });

    it('przepuszcza dev na tym samym hoscie, ale w innej bazie', () => {
        const prod = 'mongodb+srv://user:haslo@cluster0.yca9wrm.mongodb.net/?retryWrites=true';
        const dev = 'mongodb+srv://user:haslo@cluster0.yca9wrm.mongodb.net/ps_dev_sessions?retryWrites=true';
        expect(() =>
            assertDevSessionStoreIsolated('development', dev, prod),
        ).not.toThrow();
    });

    it('przepuszcza, gdy brak ktoregokolwiek URI', () => {
        expect(() =>
            assertDevSessionStoreIsolated('development', undefined, PROD_URI),
        ).not.toThrow();
        expect(() =>
            assertDevSessionStoreIsolated('development', PROD_URI, undefined),
        ).not.toThrow();
    });

    it('nie dotyka produkcji ani testow', () => {
        expect(() =>
            assertDevSessionStoreIsolated('production', PROD_URI, PROD_URI),
        ).not.toThrow();
        expect(() =>
            assertDevSessionStoreIsolated('test', PROD_URI, PROD_URI),
        ).not.toThrow();
    });
});

describe('parseMongoHostAndDb', () => {
    it('wyciaga host i baze, odrzuca poswiadczenia, parametry i koncowy ukosnik', () => {
        expect(
            parseMongoHostAndDb(
                'mongodb+srv://user:haslo@Cluster0.yca9wrm.mongodb.net/?retryWrites=true/',
            ),
        ).toEqual({ host: 'cluster0.yca9wrm.mongodb.net', db: '' });
        expect(
            parseMongoHostAndDb('mongodb://127.0.0.1:27017/ps_dev'),
        ).toEqual({ host: '127.0.0.1:27017', db: 'ps_dev' });
    });
});

describe('describeMongoTarget', () => {
    it('ukrywa login i haslo', () => {
        expect(describeMongoTarget(PROD_URI)).toBe(
            'mongodb+srv://cluster0.yca9wrm.mongodb.net/',
        );
    });

    it('radzi sobie z URI bez danych logowania i bez URI', () => {
        expect(describeMongoTarget('mongodb://localhost:27017/ps_dev')).toBe(
            'mongodb://localhost:27017/ps_dev',
        );
        expect(describeMongoTarget(undefined)).toBe('brak MONGO_URI');
    });
});
