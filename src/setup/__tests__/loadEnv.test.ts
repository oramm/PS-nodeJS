import {
    assertDevSessionStoreIsolated,
    describeMongoTarget,
} from '../loadEnv';

const PROD_URI = 'mongodb+srv://user:haslo@cluster0.yca9wrm.mongodb.net/?retryWrites=true';

describe('assertDevSessionStoreIsolated', () => {
    it('blokuje dev, gdy MONGO_URI spadlo do wartosci z .env', () => {
        expect(() =>
            assertDevSessionStoreIsolated('development', PROD_URI, PROD_URI),
        ).toThrow(/produkcyjnego magazynu sesji/);
    });

    it('przepuszcza dev z wlasnym MONGO_URI', () => {
        expect(() =>
            assertDevSessionStoreIsolated(
                'development',
                'mongodb://localhost:27017/ps_dev',
                PROD_URI,
            ),
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
