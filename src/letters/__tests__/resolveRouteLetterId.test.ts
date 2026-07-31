import resolveRouteLetterId from '../resolveRouteLetterId';

describe('resolveRouteLetterId', () => {
    it('bierze id z adresu, gdy ciało żądania go nie niesie', () => {
        expect(resolveRouteLetterId('6163', undefined)).toBe(6163);
        expect(resolveRouteLetterId('6163', null)).toBe(6163);
        expect(resolveRouteLetterId('6163', '')).toBe(6163);
    });

    it('przepuszcza zgodne id, niezależnie od tego czy przyszło liczbą czy tekstem', () => {
        expect(resolveRouteLetterId('6163', 6163)).toBe(6163);
        expect(resolveRouteLetterId('6163', '6163')).toBe(6163);
        expect(resolveRouteLetterId('6163', ' 6163 ')).toBe(6163);
    });

    it('ODRZUCA id z ciała wskazujące inne pismo, zamiast po cichu je poprawiać', () => {
        // Luka domykana tym modułem: PUT /letter/6163 z id 6164 w ciele edytowało
        // pismo 6164, razem z przeniesieniem jego skrótów na Dysku.
        expect(() => resolveRouteLetterId('6163', 6164)).toThrow(
            /Niezgodny identyfikator pisma/
        );
        expect(() => resolveRouteLetterId('6163', '6164')).toThrow(
            /adres wskazuje 6163/
        );
    });

    it('nie daje się nabrać na id, które tylko zaczyna się od właściwej liczby', () => {
        // parseInt('6163abc') === 6163 — tak wyglądałaby cicha reinterpretacja.
        expect(() => resolveRouteLetterId('6163', '6163abc')).toThrow(
            /Niezgodny identyfikator pisma/
        );
        expect(() => resolveRouteLetterId('6163abc', undefined)).toThrow(
            /Nieprawidłowy identyfikator pisma w adresie/
        );
    });

    it('odrzuca adres, który nie jest dodatnią liczbą całkowitą', () => {
        for (const bad of ['', 'abc', '0', '-5', '6163.5', undefined, null]) {
            expect(() => resolveRouteLetterId(bad, undefined)).toThrow(
                /Nieprawidłowy identyfikator pisma w adresie/
            );
        }
    });

    it('odrzuca id z ciała, które nie jest dodatnią liczbą całkowitą', () => {
        for (const bad of [0, -1, 6163.5, {}, [], true, 'null']) {
            expect(() => resolveRouteLetterId('6163', bad)).toThrow(
                /Niezgodny identyfikator pisma/
            );
        }
    });
});
