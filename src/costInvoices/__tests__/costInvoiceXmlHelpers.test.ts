import { extractSaleDateFromFa, extractDueDateFromFa } from '../costInvoiceXmlHelpers';

describe('extractSaleDateFromFa', () => {
    it('zwraca datę z fa.P_6 gdy jest obecne', () => {
        const fa = { P_6: '2024-03-15' };
        const result = extractSaleDateFromFa(fa, {});
        expect(result).toEqual(new Date('2024-03-15'));
    });

    it('fallback na naglowek.DataSprzedazy gdy brak P_6', () => {
        const fa = {};
        const naglowek = { DataSprzedazy: '2024-02-10' };
        const result = extractSaleDateFromFa(fa, naglowek);
        expect(result).toEqual(new Date('2024-02-10'));
    });

    it('zwraca najwcześniejszą datę z FaWiersz[].P_6A gdy brak P_6 i DataSprzedazy', () => {
        const fa = {
            FaWiersz: [
                { P_6A: '2024-04-20' },
                { P_6A: '2024-04-10' },
                { P_6A: '2024-04-30' },
            ],
        };
        const result = extractSaleDateFromFa(fa, {});
        expect(result).toEqual(new Date('2024-04-10'));
    });

    it('fallback na fa.P_1 gdy brak P_6 i DataSprzedazy (FA(3): brak P_6 = data sprzedaży = data wystawienia)', () => {
        const fa = { P_1: '2024-06-01', FaWiersz: [{ P_7: 'Usługa' }] };
        const result = extractSaleDateFromFa(fa, {});
        expect(result).toEqual(new Date('2024-06-01'));
    });

    it('zwraca undefined gdy brak P_6, P_1 i FaWiersz.P_6A', () => {
        const fa = { FaWiersz: [{ P_7: 'Usługa' }] };
        const result = extractSaleDateFromFa(fa, {});
        expect(result).toBeUndefined();
    });
});

describe('extractDueDateFromFa', () => {
    it('zwraca datę z Platnosc.TerminPlatnosci jako obiekt', () => {
        const fa = {
            Platnosc: {
                TerminPlatnosci: { Termin: '2024-05-01' },
            },
        };
        const result = extractDueDateFromFa(fa);
        expect(result).toEqual(new Date('2024-05-01'));
    });

    it('zwraca najwcześniejszą datę z Platnosc.TerminPlatnosci jako tablica', () => {
        const fa = {
            Platnosc: {
                TerminPlatnosci: [
                    { Termin: '2024-06-15' },
                    { Termin: '2024-05-31' },
                    { Termin: '2024-07-01' },
                ],
            },
        };
        const result = extractDueDateFromFa(fa);
        expect(result).toEqual(new Date('2024-05-31'));
    });

    it('zwraca undefined gdy brak Platnosc.TerminPlatnosci i brak fallbacku', () => {
        const fa = { Platnosc: {} };
        const result = extractDueDateFromFa(fa);
        expect(result).toBeUndefined();
    });

    it('używa fallbacku fa.TerminPlatnosci.TerminPlatnosci gdy brak Platnosc', () => {
        const fa = {
            TerminPlatnosci: { TerminPlatnosci: '2024-04-30' },
        };
        const result = extractDueDateFromFa(fa);
        expect(result).toEqual(new Date('2024-04-30'));
    });
});
