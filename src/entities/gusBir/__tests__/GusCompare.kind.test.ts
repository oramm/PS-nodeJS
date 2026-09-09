/**
 * GUS-4a — werdykt dwustopniowy: różnica co do rzeczy (`DIFF`) kontra różnica samego
 * zapisu (`DIFF_MINOR`).
 *
 * Wszystkie przypadki niżej to PRAWDZIWE pary z pierwszego pełnego przebiegu na kopii
 * produkcyjnych danych (2026-09-09), nie wymyślone dane. Numer rekordu przy każdym
 * z nich jest po to, żeby dało się do niego wrócić w bazie.
 *
 * Powód istnienia tego podziału jest zmierzony: bez niego „różni się" zapalało się przy
 * 242 z 379 sprawdzonych podmiotów, czyli przy 2/3 słownika, i plakietka nie mówiła nic.
 */

import { describe, it, expect } from '@jest/globals';
import { compareWithGus, GusSnapshot } from '../GusCompare';

function verdict(
    ps: { name?: string; address?: string },
    gus: { name?: string; address?: string }
) {
    return compareWithGus(ps, gus as GusSnapshot);
}

describe('compareWithGus — różnica co do rzeczy zapala DIFF', () => {
    it('rekord 38: pod tym NIP-em rejestr widzi zupełnie inny podmiot', () => {
        const result = verdict(
            {
                name: 'INIKO Grupa MGGP',
                address: 'ul. Zagłoby 8/2B, 35-303 Rzeszów',
            },
            {
                name: 'HTS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                address: 'ul. Ciepłownicza 8A, 35-322 Rzeszów',
            }
        );
        expect(result.status).toBe('DIFF');
        expect(result.differences.map((d) => d.kind)).toEqual([
            'MATERIAL',
            'MATERIAL',
        ]);
    });

    it('rekord 61: ten sam kod pocztowy, inna miejscowość', () => {
        const result = verdict(
            { address: 'ul. Powstańców Śl. 54, 46-040 Ozimek' },
            { address: 'ul. Powstańców Śląskich 54, 46-040 Antoniów' }
        );
        expect(result.status).toBe('DIFF');
    });

    it('rekord 192: inne miasto i inny kod', () => {
        const result = verdict(
            { address: 'ul.Krzycka 15a/9  53-019 Wrocław' },
            { address: 'ul. Szosa Chełmińska 177-181, 87-100 Toruń' }
        );
        expect(result.status).toBe('DIFF');
    });

    it('rekord 299: zmiana nazwy prawnej spółki', () => {
        const result = verdict(
            {
                name: 'Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Spółka Akcyjna w Krakowie',
            },
            { name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA' }
        );
        expect(result.status).toBe('DIFF');
    });

    it('rekord 517: jednostka wpisana z NIP-em jednostki nadrzędnej', () => {
        const result = verdict(
            { name: 'Starostwo Powiatowe w Nowym Tomyślu' },
            { name: 'POWIAT NOWOTOMYSKI' }
        );
        expect(result.status).toBe('DIFF');
    });

    it('adresu bez kodu pocztowego nie da się ocenić, więc zostaje istotny', () => {
        const result = verdict(
            { address: 'ul. Sławięcicka 19' },
            { address: 'ul. Sławięcicka 19, 47-143 Ujazd' }
        );
        expect(result.status).toBe('DIFF');
    });
});

describe('compareWithGus — sam inny zapis zapala DIFF_MINOR', () => {
    it('rekord 570: rejestr rozwija imię w nazwie ulicy i podaje pełną nazwę prawną', () => {
        const result = verdict(
            {
                name: 'Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji sp. z o.o. w Będzinie',
                address: 'ul. Kościuszki 140, 42-500 Będzin',
            },
            {
                name: 'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                address: 'ul. Tadeusza Kościuszki 140, 42-500 Będzin',
            }
        );
        expect(result.status).toBe('DIFF_MINOR');
        expect(result.differences).toHaveLength(2);
        expect(result.differences.every((d) => d.kind === 'WORDING')).toBe(true);
    });

    it('rekord 53: skrótowiec branżowy z doklejonym miastem siedziby', () => {
        const result = verdict(
            { name: 'MPWiK Żywiec' },
            {
                name: 'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                address: 'ul. Bracka 66, 34-300 Żywiec',
            }
        );
        expect(result.status).toBe('DIFF_MINOR');
    });

    it('rekord 191: skrótowiec ZWiK z nazwą miejscowości', () => {
        const result = verdict(
            { name: 'ZWiK Strzelin Sp. z o.o.' },
            {
                name: 'ZAKŁAD WODOCIĄGÓW I KANALIZACJI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                address: 'ul. Wodna 1, 57-100 Strzelin',
            }
        );
        expect(result.status).toBe('DIFF_MINOR');
    });

    it('rekord 196: ten sam adres zapisany w odwróconym porządku', () => {
        const result = verdict(
            { address: '55-040 Kobierzyce, ul. Sportowa 44' },
            { address: 'ul. Sportowa 44, 55-040 Kobierzyce' }
        );
        expect(result.status).toBe('DIFF_MINOR');
    });

    it('rekord 225: dopisek „adres korespond." obok adresu siedziby', () => {
        const result = verdict(
            {
                address: 'ul. Piaski 7, 33-340 Stary Sącz, adres korespond.: Mochnaczka Wyżna 118, 33-380 Krynica Zdrój',
            },
            { address: 'ul. Piaski 7, 33-340 Stary Sącz' }
        );
        expect(result.status).toBe('DIFF_MINOR');
    });

    it('rekord 692: śmieci w nazwie zastanej i „nr" przed numerem domu', () => {
        const result = verdict(
            {
                name: 'LEON SZUTURMA PRZEDSIĘBIORSTWO BUDOWLANE ,,COMPLEX-BUD\\\'\\\'',
                address: 'ul. Klonowa nr 4, 55-200 Stanowice',
            },
            {
                name: 'LEON SZUTURMA PRZEDSIĘBIORSTWO BUDOWLANE"COMPLEX-BUD"',
                address: 'ul. Klonowa 4, 55-200 Stanowice',
            }
        );
        expect(result.status).toBe('DIFF_MINOR');
    });

    it('rekord 74: wieś w rejestrze, poczta w PS — ten sam kod pocztowy', () => {
        const result = verdict(
            { address: 'Bystrzyca Dolna 55A, 58-100 Świdnica' },
            { address: '55A, 58-100 Bystrzyca Dolna' }
        );
        expect(result.status).toBe('DIFF_MINOR');
    });
});

describe('compareWithGus — stany, których podział nie dotyka', () => {
    it('zgodne dane dalej dają OK', () => {
        const result = verdict(
            { name: 'ENVI Sp. z o.o.', address: 'ul. Piękna 5, 00-001 Warszawa' },
            {
                name: 'ENVI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                address: 'ul. Piękna 5, 00-001 Warszawa',
            }
        );
        expect(result.status).toBe('OK');
    });

    it('zakończona działalność bije oba rodzaje różnicy', () => {
        const result = compareWithGus(
            { name: 'MPWiK Żywiec' },
            {
                name: 'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                closedAt: '2026-01-30',
            }
        );
        expect(result.status).toBe('CLOSED');
    });

    it('inny REGON zostaje różnicą co do rzeczy — to numer z rejestru, nie zapis', () => {
        const result = compareWithGus(
            { name: 'ENVI', regon: '531090218' },
            { name: 'ENVI', regon: '000541078' }
        );
        expect(result.status).toBe('DIFF');
        expect(result.differences[0].kind).toBe('MATERIAL');
    });
});
