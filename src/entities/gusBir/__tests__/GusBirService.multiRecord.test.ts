/**
 * GPO-1 — rejestr GUS oddaje pod jednym NIP-em tyle wpisów, ile jednostek ten numer
 * obsługuje. Kod z packa GUS zakładał jeden wpis i czytał nazwę z tablicy, czyli z niczego:
 * podmiot dostawał migawkę `{"name":"","address":""}`, porównanie nie widziało ani jednej
 * różnicy i wychodziło z tego „zgodny".
 *
 * Pack GPO, checkpoint GPO-1 (decyzje D-GPO-1 i D-GPO-2):
 *   20_projects/Aplikacje/PS.APP.01/plans/2026-09-10-gpo-poprawki-po-packu-gus-plan.md
 *
 * Oba kształty odpowiedzi w tym pliku są PRZEPISANE Z PRAWDZIWEGO REJESTRU (odpytanie
 * kluczem firmowym 2026-09-10), nie wymyślone:
 *   - MPWiK w m.st. Warszawie (5250005662): spółka czynna + poprzednik wykreślony w 2003,
 *   - HYDRO-TAP Stanisław Kafel (9110015740): działalność gospodarcza i gospodarstwo rolne
 *     tej samej osoby, oba czynne, ten sam REGON, różne silosy rejestru.
 *
 * KONTROLA NEGATYWNA (D-GPO-2) jest tu osobnym testem i ma zostać nawet gdyby reguła
 * wyboru wpisu kiedyś się zmieniła: odpowiedź, z której nie da się odczytać nazwy, musi
 * skończyć się błędem, a nie cichą pustką podaną dalej jako dane z rejestru.
 */
import GusBirService, { GusBirEmptyRecordError } from '../GusBirService';

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

/** MPWiK Warszawa — spółka czynna i jej wykreślony poprzednik pod tym samym NIP-em. */
const MPWIK_WARSZAWA = [
    {
        Regon: '015314758',
        Nip: '5250005662',
        Nazwa: 'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI W M.ST. WARSZAWIE SPÓŁKA AKCYJNA',
        Miejscowosc: 'Warszawa',
        KodPocztowy: '02-015',
        Ulica: 'Plac Sokratesa Starynkiewicza',
        NrNieruchomosci: '5',
        NrLokalu: '',
        Typ: 'P',
        SilosID: '6',
        DataZakonczeniaDzialalnosci: '',
    },
    {
        Regon: '000149080',
        Nip: '5250005662',
        Nazwa: 'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI W M.ST.WARSZAWIE',
        Miejscowosc: 'Warszawa',
        KodPocztowy: '02-015',
        Ulica: 'pl. Sokratesa Starynkiewicza',
        NrNieruchomosci: '5',
        NrLokalu: '',
        Typ: 'P',
        SilosID: '6',
        DataZakonczeniaDzialalnosci: '2003-01-01',
    },
];

/** HYDRO-TAP — działalność gospodarcza (silos 1) i gospodarstwo rolne (silos 2), oba czynne. */
const HYDRO_TAP = [
    {
        Regon: '930335077',
        Nip: '9110015740',
        Nazwa: 'Przedsiębiorstwo Inżynieryjno Budowlane HYDRO-TAP Stanisław Kafel',
        Miejscowosc: 'Wrocław',
        KodPocztowy: '51-180',
        Ulica: 'ul. Przedwiośnie',
        NrNieruchomosci: '1',
        NrLokalu: '',
        Typ: 'F',
        SilosID: '1',
        DataZakonczeniaDzialalnosci: '',
    },
    {
        Regon: '930335077',
        Nip: '9110015740',
        Nazwa: 'GOSPODARSTWO ROLNE STANISŁAW KAFEL',
        Miejscowosc: 'Wrocław',
        KodPocztowy: '51-180',
        Ulica: 'ul. Przedwiośnie',
        NrNieruchomosci: '1',
        NrLokalu: '',
        Typ: 'F',
        SilosID: '2',
        DataZakonczeniaDzialalnosci: '',
    },
];

describe('GusBirService.lookupByNip — kilka wpisów pod jednym NIP-em (GPO-1, D-GPO-1)', () => {
    const originalKey = process.env.GUS_BIR_KEY;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GUS_BIR_KEY = 'test-key';
    });

    afterEach(() => {
        process.env.GUS_BIR_KEY = originalKey;
    });

    it('spółka czynna obok wykreślonego poprzednika -> bierze czynną, nie pustkę', async () => {
        mockSearch.mockResolvedValue(MPWIK_WARSZAWA);
        mockReport.mockResolvedValue({
            praw_adSiedzUlica_Nazwa: 'Plac Sokratesa Starynkiewicza',
            praw_adSiedzNumerNieruchomosci: '5',
            praw_adSiedzKodPocztowy: '02015',
            praw_adSiedzMiejscowosc_Nazwa: 'Warszawa',
            praw_numerWRejestrzeEwidencji: '0000146138',
            praw_rodzajRejestruEwidencji_Nazwa: 'REJESTR PRZEDSIĘBIORCÓW',
        });

        const result = await GusBirService.lookupByNip('5250005662');

        expect(result.name).toBe(
            'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI W M.ST. WARSZAWIE SPÓŁKA AKCYJNA'
        );
        expect(result.regon).toBe('015314758');
        expect(result.krs).toBe('0000146138');
        // Wykreślenie dotyczy poprzednika, nie tego podmiotu — inaczej wyszłoby CLOSED.
        expect(result.closedAt).toBeUndefined();
        // Raport pobrany dla WYBRANEGO wpisu, nie dla wykreślonego.
        expect(mockReport).toHaveBeenCalledWith({
            regon: '015314758',
            report: 'BIR11OsPrawna',
        });
    });

    it('dwa czynne wpisy tej samej osoby -> bierze działalność gospodarczą, nie gospodarstwo rolne', async () => {
        mockSearch.mockResolvedValue(HYDRO_TAP);

        const result = await GusBirService.lookupByNip('9110015740');

        expect(result.name).toBe(
            'Przedsiębiorstwo Inżynieryjno Budowlane HYDRO-TAP Stanisław Kafel'
        );
        // Osoba fizyczna: raportu się nie pobiera (zachowanie z packa GUS zostaje).
        expect(mockReport).not.toHaveBeenCalled();
    });

    it('wszystkie wpisy wykreślone -> wykreślenie zostaje wiadomością o podmiocie', async () => {
        mockSearch.mockResolvedValue([
            { ...HYDRO_TAP[0], DataZakonczeniaDzialalnosci: '2020-05-05' },
            { ...HYDRO_TAP[1], DataZakonczeniaDzialalnosci: '2018-01-01' },
        ]);

        const result = await GusBirService.lookupByNip('9110015740');

        expect(result.closedAt).toBe('2020-05-05');
    });

    it('jeden wpis w tablicy -> tak samo jak wpis podany wprost', async () => {
        mockSearch.mockResolvedValue([HYDRO_TAP[0]]);

        const result = await GusBirService.lookupByNip('9110015740');

        expect(result.name).toBe(
            'Przedsiębiorstwo Inżynieryjno Budowlane HYDRO-TAP Stanisław Kafel'
        );
    });
});

describe('GusBirService.lookupByNip — odpowiedź bez nazwy (GPO-1, D-GPO-2)', () => {
    const originalKey = process.env.GUS_BIR_KEY;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GUS_BIR_KEY = 'test-key';
    });

    afterEach(() => {
        process.env.GUS_BIR_KEY = originalKey;
    });

    it('KONTROLA NEGATYWNA: wpis bez nazwy -> błąd, nie pusty podmiot', async () => {
        mockSearch.mockResolvedValue({
            Regon: '930335077',
            Nip: '9110015740',
            Nazwa: '   ',
            Typ: 'F',
        });

        await expect(
            GusBirService.lookupByNip('9110015740')
        ).rejects.toBeInstanceOf(GusBirEmptyRecordError);
    });

    it('KONTROLA NEGATYWNA: pusta tablica -> błąd, nie pusty podmiot', async () => {
        mockSearch.mockResolvedValue([]);

        await expect(
            GusBirService.lookupByNip('9110015740')
        ).rejects.toBeInstanceOf(GusBirEmptyRecordError);
    });

    it('KONTROLA NEGATYWNA: kształt, którego dziś nie znamy -> błąd, nie pusty podmiot', async () => {
        mockSearch.mockResolvedValue({ CosZupelnieInnego: 'x' });

        await expect(
            GusBirService.lookupByNip('9110015740')
        ).rejects.toBeInstanceOf(GusBirEmptyRecordError);
    });
});
