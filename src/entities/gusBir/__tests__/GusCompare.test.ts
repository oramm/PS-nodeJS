/**
 * GUS-2 — normalizacja do porównania i werdykt. Bez bazy, bez sieci, bez zegara.
 *
 * Przypadki wzięte z produkcji (odczyt 2026-09-09, sesja GUS-1):
 *  - Kraków: PS „Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Spółka Akcyjna
 *    w Krakowie", GUS „WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA" — prawdziwa zmiana nazwy,
 *  - Rzeszów: PS „ul. Zagłoby 8/2B, 35-303", GUS „ul. Ciepłownicza 8A, 35-322" — zmiana adresu,
 *  - Kobierzyce: PS „Al. Pałacowa 1", GUS „Aleja Pałacowa 1" — sama kosmetyka zapisu.
 *
 * Pułapka P-3: bez normalizacji trzeci przypadek pokazałby różnicę i plakietka
 * zamieniłaby się w szum.
 */

import { describe, it, expect } from '@jest/globals';
import {
    compareWithGus,
    isSameAfterNormalization,
    normalizeForCompare,
} from '../GusCompare';

describe('normalizeForCompare — skróty form prawnych', () => {
    it('„Sp. z o.o." i „SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" to ten sam tekst', () => {
        expect(
            isSameAfterNormalization(
                'Test-Bud Sp. z o.o.',
                'TEST-BUD SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ'
            )
        ).toBe(true);
    });

    it('„S.A." i „SPÓŁKA AKCYJNA" to ten sam tekst', () => {
        expect(
            isSameAfterNormalization(
                'Wodociągi Miasta Krakowa S.A.',
                'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA'
            )
        ).toBe(true);
    });

    it('„sp. j." i „SPÓŁKA JAWNA" to ten sam tekst', () => {
        expect(
            isSameAfterNormalization('Kowalski i Wspólnicy sp. j.', 'KOWALSKI I WSPÓLNICY SPÓŁKA JAWNA')
        ).toBe(true);
    });

    it('„sp. k." i „SPÓŁKA KOMANDYTOWA" to ten sam tekst', () => {
        expect(
            isSameAfterNormalization('Alfa sp. k.', 'ALFA SPÓŁKA KOMANDYTOWA')
        ).toBe(true);
    });

    it('spółka komandytowa i komandytowo-akcyjna zostają różne', () => {
        expect(
            isSameAfterNormalization(
                'Alfa SPÓŁKA KOMANDYTOWA',
                'Alfa SPÓŁKA KOMANDYTOWO-AKCYJNA'
            )
        ).toBe(false);
    });

    it('złożona forma „sp. z o.o. sp. k." schodzi do tego samego co pełny zapis', () => {
        expect(
            isSameAfterNormalization(
                'Beta sp. z o.o. sp. k.',
                'BETA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ SPÓŁKA KOMANDYTOWA'
            )
        ).toBe(true);
    });

    it('dwie różne firmy o tej samej formie prawnej zostają różne', () => {
        expect(
            isSameAfterNormalization('Alfa Sp. z o.o.', 'Beta Sp. z o.o.')
        ).toBe(false);
    });
});

describe('normalizeForCompare — adresy', () => {
    it('„Al." i „Aleja" to ten sam adres (Kobierzyce, przypadek produkcyjny)', () => {
        expect(
            isSameAfterNormalization(
                'Al. Pałacowa 1, 55-040 Kobierzyce',
                'Aleja Pałacowa 1, 55-040 Kobierzyce'
            )
        ).toBe(true);
    });

    it('„ul." i „ulica" to ten sam adres', () => {
        expect(
            isSameAfterNormalization('ul. Piękna 5, 00-001 Warszawa', 'ULICA PIĘKNA 5, 00-001 WARSZAWA')
        ).toBe(true);
    });

    it('kod pocztowy z myślnikiem i bez to ten sam adres', () => {
        expect(
            isSameAfterNormalization('ul. Piękna 5, 00-001 Warszawa', 'ul. Piękna 5, 00001 Warszawa')
        ).toBe(true);
    });

    it('przecinki, kropki i nadmiarowe spacje nie robią różnicy', () => {
        expect(
            isSameAfterNormalization(
                'ul. Jana Brzechwy 3,  49-305  Brzeg',
                'UL JANA BRZECHWY 3 49-305 BRZEG'
            )
        ).toBe(true);
    });

    it('inna ulica to prawdziwa różnica (Rzeszów, przypadek produkcyjny)', () => {
        expect(
            isSameAfterNormalization(
                'ul. Zagłoby 8/2B, 35-303 Rzeszów',
                'ul. Ciepłownicza 8A, 35-322 Rzeszów'
            )
        ).toBe(false);
    });

    it('inny numer domu przy tej samej ulicy to różnica', () => {
        expect(
            isSameAfterNormalization('ul. Piękna 5, 00-001 Warszawa', 'ul. Piękna 7, 00-001 Warszawa')
        ).toBe(false);
    });

    it('wynik normalizacji nigdy nie jest tym, co idzie do zapisu — to tekst roboczy', () => {
        expect(normalizeForCompare('Test-Bud Sp. z o.o.')).toBe('test-bud spzoo');
    });
});

describe('compareWithGus — werdykt', () => {
    const psKrakow = {
        name: 'Wodociągi Miasta Krakowa S.A.',
        address: 'ul. Senatorska 1, 30-106 Kraków',
    };

    it('sam inny zapis formy prawnej daje OK', () => {
        const result = compareWithGus(psKrakow, {
            name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA',
            address: 'ul. Senatorska 1, 30-106 Kraków',
        });
        expect(result.status).toBe('OK');
        expect(result.differences).toEqual([]);
    });

    it('prawdziwa zmiana nazwy daje DIFF z obiema wersjami bez normalizacji', () => {
        const result = compareWithGus(
            {
                name: 'Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Spółka Akcyjna w Krakowie',
                address: 'ul. Senatorska 1, 30-106 Kraków',
            },
            {
                name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA',
                address: 'ul. Senatorska 1, 30-106 Kraków',
            }
        );
        expect(result.status).toBe('DIFF');
        expect(result.differences).toHaveLength(1);
        expect(result.differences[0].field).toBe('name');
        expect(result.differences[0].inPs).toContain('Miejskie Przedsiębiorstwo');
        expect(result.differences[0].inGus).toBe('WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA');
    });

    it('prawdziwa zmiana ulicy daje DIFF', () => {
        const result = compareWithGus(
            { name: 'HTS Sp. z o.o.', address: 'ul. Zagłoby 8/2B, 35-303 Rzeszów' },
            {
                name: 'HTS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
                address: 'ul. Ciepłownicza 8A, 35-322 Rzeszów',
            }
        );
        expect(result.status).toBe('DIFF');
        expect(result.differences.map((d) => d.field)).toEqual(['address']);
    });

    it('data zakończenia działalności bije wszystko — CLOSED nawet przy zgodnych danych', () => {
        const result = compareWithGus(psKrakow, {
            name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA',
            address: 'ul. Senatorska 1, 30-106 Kraków',
            closedAt: '2024-03-31',
        });
        expect(result.status).toBe('CLOSED');
    });

    it('CLOSED i tak zwraca listę różnic — ekran pokazuje je obok plakietki', () => {
        const result = compareWithGus(psKrakow, {
            name: 'ZUPEŁNIE INNA NAZWA',
            address: 'ul. Senatorska 1, 30-106 Kraków',
            closedAt: '2024-03-31',
        });
        expect(result.status).toBe('CLOSED');
        expect(result.differences.map((d) => d.field)).toEqual(['name']);
    });

    it('puste pole w PS nie jest różnicą, tylko brakiem do uzupełnienia', () => {
        const result = compareWithGus(
            { ...psKrakow, regon: null, krs: undefined },
            {
                name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA',
                address: 'ul. Senatorska 1, 30-106 Kraków',
                regon: '350720024',
                krs: '0000057165',
            }
        );
        expect(result.status).toBe('OK');
    });

    it('sprzeczny REGON jest różnicą', () => {
        const result = compareWithGus(
            { ...psKrakow, regon: '111111111' },
            {
                name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA',
                address: 'ul. Senatorska 1, 30-106 Kraków',
                regon: '350720024',
            }
        );
        expect(result.status).toBe('DIFF');
        expect(result.differences.map((d) => d.field)).toEqual(['regon']);
    });

    it('pole, którego GUS nie podał, nie jest różnicą — rejestr nie zaprzecza milczeniem', () => {
        const result = compareWithGus(
            { ...psKrakow, krs: '0000057165' },
            {
                name: 'WODOCIĄGI MIASTA KRAKOWA SPÓŁKA AKCYJNA',
                address: 'ul. Senatorska 1, 30-106 Kraków',
            }
        );
        expect(result.status).toBe('OK');
    });
});
