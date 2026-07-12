/**
 * NIP-G1 — DB-free unit tests for GusBirService: mapping + address
 * concatenation, mocked `bir1` (no real GUS calls). Matches the mocking idiom
 * of WhiteListClient.test.ts (mock the external client, assert on shape).
 */
import GusBirService, {
    GusBirNotConfiguredError,
    GusBirNotFoundError,
    buildAddress,
} from '../GusBirService';

const mockSearch = jest.fn();
const mockReport = jest.fn();

class FakeBirError extends Error {}

jest.mock('bir1', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        search: mockSearch,
        report: mockReport,
    })),
    BirError: FakeBirError,
}));

describe('buildAddress — konkatenacja adresu', () => {
    it('sklada ulica+nr, kod-miasto z przecinkiem', () => {
        expect(
            buildAddress({ ulica: 'ul. Piękna', nr: '5', kod: '00-001', miejscowosc: 'Warszawa' }),
        ).toBe('ul. Piękna 5, 00-001 Warszawa');
    });

    it('dolacza numer lokalu przez /', () => {
        expect(
            buildAddress({ ulica: 'ul. Piękna', nr: '5', lokal: '3', kod: '00-001', miejscowosc: 'Warszawa' }),
        ).toBe('ul. Piękna 5/3, 00-001 Warszawa');
    });

    it('normalizuje kod pocztowy bez myslnika (raport GUS) do NN-NNN', () => {
        expect(buildAddress({ ulica: 'ul. Test', nr: '1', kod: '02674', miejscowosc: 'Warszawa' })).toBe(
            'ul. Test 1, 02-674 Warszawa',
        );
    });

    it('pomija puste pola bez zbędnych przecinków/spacji', () => {
        expect(buildAddress({ miejscowosc: 'Warszawa' })).toBe('Warszawa');
        expect(buildAddress({})).toBe('');
    });
});

describe('GusBirService.isConfigured / lookupByNip — brak klucza (fail-closed)', () => {
    const originalKey = process.env.GUS_BIR_KEY;

    afterEach(() => {
        process.env.GUS_BIR_KEY = originalKey;
    });

    it('isConfigured() === false gdy brak GUS_BIR_KEY', () => {
        delete process.env.GUS_BIR_KEY;
        expect(GusBirService.isConfigured()).toBe(false);
    });

    it('lookupByNip rzuca GusBirNotConfiguredError gdy brak klucza, bez wywolania bir1', async () => {
        delete process.env.GUS_BIR_KEY;
        await expect(GusBirService.lookupByNip('5261040567')).rejects.toBeInstanceOf(
            GusBirNotConfiguredError,
        );
        expect(mockSearch).not.toHaveBeenCalled();
    });
});

describe('GusBirService.lookupByNip — mapowanie odpowiedzi bir1 (klucz test/bir1)', () => {
    const originalKey = process.env.GUS_BIR_KEY;

    beforeEach(() => {
        process.env.GUS_BIR_KEY = 'test-key';
    });

    afterEach(() => {
        process.env.GUS_BIR_KEY = originalKey;
    });

    it('osoba prawna: uzywa search() + report() (adres z raportu, KRS z rejestru przedsiebiorcow)', async () => {
        mockSearch.mockResolvedValue({
            Regon: '011417295',
            Nip: '5261040567',
            Nazwa: 'T-MOBILE POLSKA SPÓŁKA AKCYJNA',
            Ulica: 'ul. Search-Krucza',
            NrNieruchomosci: '99',
            NrLokalu: '',
            KodPocztowy: '02-999',
            Miejscowosc: 'Search-Warszawa',
            Typ: 'P',
        });
        mockReport.mockResolvedValue({
            praw_adSiedzUlica_Nazwa: 'ul. Test-Krucza',
            praw_adSiedzNumerNieruchomosci: '12',
            praw_adSiedzNumerLokalu: '',
            praw_adSiedzKodPocztowy: '02674',
            praw_adSiedzMiejscowosc_Nazwa: 'Warszawa',
            praw_numerWRejestrzeEwidencji: '0000391193',
            praw_rodzajRejestruEwidencji_Nazwa: 'REJESTR PRZEDSIĘBIORCÓW',
        });

        const result = await GusBirService.lookupByNip('5261040567');

        expect(mockReport).toHaveBeenCalledWith({ regon: '011417295', report: 'BIR11OsPrawna' });
        expect(result).toEqual({
            name: 'T-MOBILE POLSKA SPÓŁKA AKCYJNA',
            address: 'ul. Test-Krucza 12, 02-674 Warszawa',
            regon: '011417295',
            krs: '0000391193',
        });
    });

    it('osoba fizyczna (Typ F): nie wywoluje report(), adres/regon z search(), brak KRS', async () => {
        mockSearch.mockResolvedValue({
            Regon: '999999990',
            Nip: '9999999999',
            Nazwa: 'ZAKŁAD USŁUGOWY JANUSZ TEST',
            Ulica: '',
            NrNieruchomosci: '',
            NrLokalu: '',
            KodPocztowy: '',
            Miejscowosc: '',
            Typ: 'F',
        });

        const result = await GusBirService.lookupByNip('9999999999');

        expect(mockReport).not.toHaveBeenCalled();
        expect(result).toEqual({
            name: 'ZAKŁAD USŁUGOWY JANUSZ TEST',
            address: '',
            regon: '999999990',
            krs: undefined,
        });
    });

    it('rejestr inny niz KRS (nie REJESTR PRZEDSIĘBIORCÓW) -> krs undefined', async () => {
        mockSearch.mockResolvedValue({
            Regon: '123456785',
            Nazwa: 'FUNDACJA TEST',
            Typ: 'P',
        });
        mockReport.mockResolvedValue({
            praw_numerWRejestrzeEwidencji: '0000999999',
            praw_rodzajRejestruEwidencji_Nazwa: 'EWIDENCJA FUNDACJI',
        });

        const result = await GusBirService.lookupByNip('1111111111');
        expect(result.krs).toBeUndefined();
    });

    it('report() rzuca blad -> fallback do adresu z search(), brak KRS (lookup sie nie wywala)', async () => {
        mockSearch.mockResolvedValue({
            Regon: '011417295',
            Nazwa: 'FIRMA SA',
            Ulica: 'ul. Search',
            NrNieruchomosci: '1',
            KodPocztowy: '00-001',
            Miejscowosc: 'Warszawa',
            Typ: 'P',
        });
        mockReport.mockRejectedValue(new Error('GUS timeout'));

        const result = await GusBirService.lookupByNip('5260001016');

        expect(result).toEqual({
            name: 'FIRMA SA',
            address: 'ul. Search 1, 00-001 Warszawa',
            regon: '011417295',
            krs: undefined,
        });
    });

    it('search() rzuca BirError (brak wynikow) -> GusBirNotFoundError', async () => {
        mockSearch.mockRejectedValue(new FakeBirError('No data found for the specified search criteria.'));

        await expect(GusBirService.lookupByNip('1111111111')).rejects.toBeInstanceOf(GusBirNotFoundError);
    });

    it('search() rzuca inny blad (siec) -> propaguje sie nienaruszony', async () => {
        mockSearch.mockRejectedValue(new Error('ECONNRESET'));

        await expect(GusBirService.lookupByNip('5261040567')).rejects.toThrow('ECONNRESET');
    });
});
