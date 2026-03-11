import { extractSaleDateFromFa, extractDueDateFromFa, extractPaymentMethodFromFa, extractPaymentInfoFromFa, extractInvoiceTypeFromFa } from '../costInvoiceXmlHelpers';

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

describe('extractPaymentMethodFromFa', () => {
    it('zwraca "gotówka" dla kodu 1', () => {
        expect(extractPaymentMethodFromFa({ Platnosc: { FormaPlatnosci: 1 } })).toBe('gotówka');
    });

    it('zwraca "przelew" dla kodu 6', () => {
        expect(extractPaymentMethodFromFa({ Platnosc: { FormaPlatnosci: 6 } })).toBe('przelew');
    });

    it('zwraca "forma 9" dla nieznanego kodu', () => {
        expect(extractPaymentMethodFromFa({ Platnosc: { FormaPlatnosci: 9 } })).toBe('forma 9');
    });

    it('zwraca undefined gdy brak Platnosc', () => {
        expect(extractPaymentMethodFromFa({})).toBeUndefined();
    });

    it('zwraca undefined gdy brak FormaPlatnosci', () => {
        expect(extractPaymentMethodFromFa({ Platnosc: {} })).toBeUndefined();
    });
});

describe('extractPaymentInfoFromFa', () => {
    // Pomocnik: buduje FA(3) Platnosc z ZaplataCzesciowa
    function faWithPayment(kwota: number | number[], gross = 1.23, net?: number) {
        const wpłaty = Array.isArray(kwota)
            ? kwota.map((k) => ({ KwotaZaplatyCzesciowej: k, DataZaplatyCzesciowej: '2024-03-11' }))
            : { KwotaZaplatyCzesciowej: kwota, DataZaplatyCzesciowej: '2024-03-11' };
        return {
            Platnosc: {
                ZnacznikZaplatyCzesciowej: 1,
                ZaplataCzesciowa: wpłaty,
                FormaPlatnosci: 6,
            },
        };
    }

    function faFullyPaid(flag: string | number = 1) {
        return {
            Platnosc: {
                Zaplacono: flag,
                DataZaplaty: '2026-03-11',
                FormaPlatnosci: 6,
            },
        };
    }

    it('PAID gdy Platnosc.Zaplacono = 1 w rzeczywistym XML KSeF', () => {
        expect(extractPaymentInfoFromFa(faFullyPaid(), 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1.23,
        });
    });

    it('PAID gdy Platnosc.Zaplacono = "1" jako string', () => {
        expect(extractPaymentInfoFromFa(faFullyPaid('1'), 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1.23,
        });
    });

    it('paymentDate wypełniony z DataZaplaty przy Zaplacono=1', () => {
        const result = extractPaymentInfoFromFa(faFullyPaid(), 1.23, 1.00);
        expect(result.paymentDate).toEqual(new Date('2026-03-11'));
    });

    it('paymentDate undefined gdy brak DataZaplaty przy Zaplacono=1', () => {
        const fa = { Platnosc: { Zaplacono: 1 } };
        const result = extractPaymentInfoFromFa(fa, 1.23);
        expect(result.paymentDate).toBeUndefined();
    });

    it('PAID gdy KwotaZaplatyCzesciowej >= grossAmount (wariant brutto)', () => {
        const fa = faWithPayment(1.23);
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1.23,
        });
    });

    it('paymentDate wypełniony z DataZaplatyCzesciowej przy PAID przez sumę', () => {
        const fa = faWithPayment(1.23);
        const result = extractPaymentInfoFromFa(fa, 1.23, 1.00);
        expect(result.paymentDate).toEqual(new Date('2024-03-11'));
    });

    it('paymentDate to najnowsza data spośród wielu wpłat częściowych', () => {
        const fa = {
            Platnosc: {
                ZnacznikZaplatyCzesciowej: 1,
                ZaplataCzesciowa: [
                    { KwotaZaplatyCzesciowej: 600, DataZaplatyCzesciowej: '2024-03-01' },
                    { KwotaZaplatyCzesciowej: 630, DataZaplatyCzesciowej: '2024-03-20' },
                ],
            },
        };
        const result = extractPaymentInfoFromFa(fa, 1230);
        expect(result.paymentDate).toEqual(new Date('2024-03-20'));
    });

    it('PARTIALLY_PAID gdy KwotaZaplatyCzesciowej = netAmount, ale brak Zaplacono', () => {
        // Samo osiągnięcie netto nie oznacza pełnej zapłaty bez jawnego znacznika pełnej płatności.
        const fa = faWithPayment(1.00);
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PARTIALLY_PAID',
            paidAmount: 1,
        });
    });

    it('PAID gdy KwotaZaplatyCzesciowej > grossAmount (nadpłata)', () => {
        const fa = faWithPayment(1.24);
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1.23,
        });
    });

    it('PARTIALLY_PAID gdy 0 < suma wpłat < netAmount', () => {
        const fa = faWithPayment(500);
        expect(extractPaymentInfoFromFa(fa, 1230, 1000)).toMatchObject({
            paymentStatus: 'PARTIALLY_PAID',
            paidAmount: 500,
        });
    });

    it('PARTIALLY_PAID gdy suma wpłat jest między netAmount a grossAmount', () => {
        const fa = faWithPayment(1100);
        expect(extractPaymentInfoFromFa(fa, 1230, 1000)).toMatchObject({
            paymentStatus: 'PARTIALLY_PAID',
            paidAmount: 1100,
        });
    });

    it('PAID suma wielu ZaplataCzesciowa >= grossAmount', () => {
        // FA(3): kilka wpisów częściowych — tutaj suma = 1230 = grossAmount
        const fa = faWithPayment([600, 630]);
        expect(extractPaymentInfoFromFa(fa, 1230)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1230,
        });
    });

    it('PAID bez netAmount gdy suma wpłat >= grossAmount', () => {
        const fa = faWithPayment(1230);
        expect(extractPaymentInfoFromFa(fa, 1230)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1230,
        });
    });

    it('PARTIALLY_PAID — realny scenariusz z XML (0.5 PLN z faktury 1.23 PLN)', () => {
        // Odpowiada rzeczywistemu XML z KSeF pokazanemu przez użytkownika
        const fa = {
            Platnosc: {
                ZnacznikZaplatyCzesciowej: 1,
                ZaplataCzesciowa: {
                    KwotaZaplatyCzesciowej: 0.5,
                    DataZaplatyCzesciowej: '2026-03-11',
                    FormaPlatnosci: 1,
                },
                FormaPlatnosci: 6,
            },
        };
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PARTIALLY_PAID',
            paidAmount: 0.5,
        });
    });

    it('UNPAID gdy brak ZnacznikZaplatyCzesciowej', () => {
        const fa = { Platnosc: { TerminPlatnosci: { Termin: '2024-05-01' }, FormaPlatnosci: 6 } };
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toEqual({
            paymentStatus: 'UNPAID',
            paidAmount: 0,
        });
    });

    it('UNPAID gdy ZnacznikZaplatyCzesciowej = "0" jako string', () => {
        const fa = {
            Platnosc: {
                ZnacznikZaplatyCzesciowej: '0',
                ZaplataCzesciowa: { KwotaZaplatyCzesciowej: 0.5 },
            },
        };
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toEqual({
            paymentStatus: 'UNPAID',
            paidAmount: 0,
        });
    });

    it('UNPAID gdy ZnacznikZaplatyCzesciowej = 1 ale brak ZaplataCzesciowa', () => {
        const fa = { Platnosc: { ZnacznikZaplatyCzesciowej: 1 } };
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toEqual({
            paymentStatus: 'UNPAID',
            paidAmount: 0,
        });
    });

    it('PAID ma priorytet nad częściowymi wpisami gdy w XML jest też Zaplacono', () => {
        const fa = {
            Platnosc: {
                Zaplacono: 1,
                ZnacznikZaplatyCzesciowej: 1,
                ZaplataCzesciowa: { KwotaZaplatyCzesciowej: 0.5 },
            },
        };
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toMatchObject({
            paymentStatus: 'PAID',
            paidAmount: 1.23,
        });
    });

    it('UNPAID gdy KwotaZaplatyCzesciowej = 0', () => {
        const fa = {
            Platnosc: {
                ZnacznikZaplatyCzesciowej: 1,
                ZaplataCzesciowa: { KwotaZaplatyCzesciowej: 0 },
            },
        };
        expect(extractPaymentInfoFromFa(fa, 1.23, 1.00)).toEqual({
            paymentStatus: 'UNPAID',
            paidAmount: 0,
        });
    });

    it('UNPAID gdy brak Platnosc', () => {
        expect(extractPaymentInfoFromFa({}, 1.23, 1.00)).toEqual({
            paymentStatus: 'UNPAID',
            paidAmount: 0,
        });
    });
});

describe('extractInvoiceTypeFromFa', () => {
    it('zwraca "VAT" dla kodu VAT', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'VAT' })).toBe('VAT');
    });

    it('zwraca kod KOR dla korekty', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'KOR' })).toBe('KOR');
    });

    it('zwraca kod ZAL dla zaliczki', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'ZAL' })).toBe('ZAL');
    });

    it('zwraca kod ROZ dla rozliczenia', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'ROZ' })).toBe('ROZ');
    });

    it('zwraca kod UPR dla uproszczonej', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'UPR' })).toBe('UPR');
    });

    it('zwraca kod KOR_ZAL dla korekty zaliczki', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'KOR_ZAL' })).toBe('KOR_ZAL');
    });

    it('zwraca kod KOR_ROZ dla korekty rozliczenia', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'KOR_ROZ' })).toBe('KOR_ROZ');
    });

    it('zwraca oryginalny kod dla nieznanego kodu', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'NIEZNANY' })).toBe('NIEZNANY');
    });

    it('jest case-insensitive: lowercase wejście → uppercase wynik', () => {
        expect(extractInvoiceTypeFromFa({ RodzajFaktury: 'vat' })).toBe('VAT');
    });

    it('zwraca undefined gdy brak RodzajFaktury', () => {
        expect(extractInvoiceTypeFromFa({})).toBeUndefined();
    });

    it('zwraca undefined gdy fa jest nullem', () => {
        expect(extractInvoiceTypeFromFa(null)).toBeUndefined();
    });
});
