import PostalDispatchItem from '../PostalDispatchItem';
import PostalDispatch from '../PostalDispatch';

/** Prawdziwe numery nadania z rejestru listow 2026 - przechodza cyfre kontrolna SSCC. */
const SSCC = '559007734369539067';
const SSCC_2 = '559007734369539074';
const FROM_SHEET = `(00)${SSCC}`;

describe('PostalDispatchItem - numer nadania', () => {
    it('zdejmuje identyfikator aplikacji (00) i zostawia 18 cyfr SSCC', () => {
        expect(PostalDispatchItem.normalizeTrackingNumber(FROM_SHEET)).toBe(SSCC);
    });

    it('przyjmuje same 18 cyfr bez prefiksu', () => {
        expect(PostalDispatchItem.normalizeTrackingNumber(SSCC)).toBe(SSCC);
    });

    it('odrzuca odczyt o zlej dlugosci - urwany skan nie moze przejsc po cichu', () => {
        expect(
            PostalDispatchItem.normalizeTrackingNumber(SSCC.slice(0, 16))
        ).toBeNull();
        expect(PostalDispatchItem.normalizeTrackingNumber(SSCC + '00')).toBeNull();
    });

    it('odrzuca numer z bledna cyfra kontrolna - przeklamana cyfra nie przejdzie', () => {
        const wrongLastDigit = SSCC.slice(0, 17) + '8';
        expect(PostalDispatchItem.normalizeTrackingNumber(wrongLastDigit)).toBeNull();

        // podmiana cyfry w srodku tez zmienia sume kontrolna
        const wrongMiddle = SSCC.slice(0, 9) + '9' + SSCC.slice(10);
        expect(wrongMiddle).not.toBe(SSCC);
        expect(PostalDispatchItem.normalizeTrackingNumber(wrongMiddle)).toBeNull();
    });

    it('odrzuca kod innego typu i puste wejscie', () => {
        expect(
            PostalDispatchItem.normalizeTrackingNumber('EE 38 951 937 5 PL')
        ).toBeNull();
        expect(PostalDispatchItem.normalizeTrackingNumber('')).toBeNull();
        expect(PostalDispatchItem.normalizeTrackingNumber(null)).toBeNull();
    });

    it('potwierdza cyfre kontrolna na numerach z roznych lat', () => {
        for (const real of [
            '559007734369539067',
            '559007734369516372',
            '759007734163447845',
            '359007731352700431',
            '659007734064088942',
        ])
            expect(PostalDispatchItem.hasValidCheckDigit(real)).toBe(true);
    });

    it('formatuje numer z powrotem do postaci arkuszowej', () => {
        expect(PostalDispatchItem.formatTrackingNumberForSheet(SSCC)).toBe(
            `(00)${SSCC}`
        );
    });

    it('konstruktor normalizuje numer wklejony w postaci z arkusza', () => {
        const item = new PostalDispatchItem({
            itemIndex: 1,
            trackingNumber: FROM_SHEET,
            addressee: 'ZWiK Strzelin',
            amount: 9.8,
        });
        expect(item.trackingNumber).toBe(SSCC);
        expect(item.consistencyErrors()).toEqual([]);
    });
});

describe('PostalDispatchItem - invarianty pozycji', () => {
    const valid = {
        itemIndex: 1,
        trackingNumber: FROM_SHEET,
        addressee: 'ZWiK Strzelin',
        amount: 9.8,
    };

    it('wymaga adresata', () => {
        expect(
            new PostalDispatchItem({ ...valid, addressee: '' }).consistencyErrors()
        ).toContainEqual(expect.stringContaining('Brak adresata'));
    });

    it('wymaga kwoty wiekszej od zera', () => {
        expect(
            new PostalDispatchItem({ ...valid, amount: 0 }).consistencyErrors()
        ).toContainEqual(expect.stringContaining('wieksza od zera'));
    });

    it('zglasza bledny numer nadania jako blad pozycji', () => {
        expect(
            new PostalDispatchItem({
                ...valid,
                trackingNumber: '123',
            }).consistencyErrors()
        ).toContainEqual(expect.stringContaining('nie jest poprawnym numerem'));
    });

    it('przyjmuje kwote z przecinkiem', () => {
        expect(
            new PostalDispatchItem({ ...valid, amount: '10,30' as any }).amount
        ).toBe(10.3);
    });
});

describe('PostalDispatch - suma i duplikaty', () => {
    const item = (tracking: string, amount: number, index = 1) =>
        new PostalDispatchItem({
            itemIndex: index,
            trackingNumber: tracking,
            addressee: `Adresat ${index}`,
            amount,
        });

    it('sumuje pozycje bez bledu zaokraglenia groszy', () => {
        const dispatch = new PostalDispatch({
            invoiceNumber: 'F00005G012600999273P',
            items: [
                item('559007734369539067', 9.8, 1),
                item('559007734369539074', 9.8, 2),
                item('559007734369539050', 9.8, 3),
                item('559007734369539081', 10.3, 4),
            ],
        });
        expect(dispatch.itemsTotal).toBe(39.7);
        expect(dispatch.consistencyErrors(39.7)).toEqual([]);
    });

    it('wykrywa powtorzony numer nadania w jednej wysylce', () => {
        const dispatch = new PostalDispatch({
            invoiceNumber: 'F00005G012600999273P',
            items: [item(SSCC, 9.8, 1), item(SSCC, 9.8, 2)],
        });
        expect(dispatch.consistencyErrors(19.6)).toContainEqual(
            expect.stringContaining('powtarza sie')
        );
    });

    it('wymaga numeru faktury i co najmniej jednego listu', () => {
        const errors = new PostalDispatch({
            invoiceNumber: '',
            items: [],
        }).consistencyErrors(null);
        expect(errors).toContainEqual(expect.stringContaining('Brak numeru faktury'));
        expect(errors).toContainEqual(expect.stringContaining('zadnego listu'));
    });

    it('znacznik bloku niesie numer faktury Poczty', () => {
        const dispatch = new PostalDispatch({
            invoiceNumber: 'F00005G012600999273P',
            items: [item(SSCC_2, 9.8)],
        });
        expect(dispatch.sheetMarker()).toBe('auto:F00005G012600999273P');
    });
});
