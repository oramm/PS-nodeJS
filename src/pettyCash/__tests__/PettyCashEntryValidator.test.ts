import PettyCashEntryValidator, {
    PettyCashEntryDto,
    PettyCashValidationError,
} from '../PettyCashEntryValidator';

const TRACKING = '559007734369539067';

const invoiceDto = (overrides: Partial<PettyCashEntryDto> = {}): PettyCashEntryDto => ({
    entryKind: 'INVOICE',
    entryDate: '2026-08-12',
    description: 'paliwo do FORD OP8105L',
    netAmount: '91,85',
    grossAmount: '112,98',
    inflowAmount: '112,98',
    documentNumber: '178/F/365/26',
    payerLabel: 'karta Krzysiek',
    settlementMethod: 'CARD',
    ...overrides,
});

const postalDto = (): PettyCashEntryDto => ({
    entryKind: 'POSTAL',
    entryDate: '2026-08-12',
    description: 'poczta - listy',
    netAmount: '9,80',
    grossAmount: '9,80',
    documentNumber: 'F00014G082600999273P',
    payerLabel: 'got. Karolina',
    settlementMethod: 'CASH',
    dispatch: {
        invoiceNumber: 'F00014G082600999273P',
        items: [
            {
                trackingNumber: `(00)${TRACKING}`,
                addressee: 'ZWiK Strzelin',
                contentsDescription: 'pismo 5620',
                amount: '9,80',
            },
        ],
    },
});

const errorsOf = (dto: PettyCashEntryDto): string[] => {
    try {
        PettyCashEntryValidator.buildAndValidate(dto);
        return [];
    } catch (error) {
        if (error instanceof PettyCashValidationError) return error.errors;
        throw error;
    }
};

describe('PettyCashEntryValidator - poprawne wejscie', () => {
    it('buduje model z kwotami zapisanymi przecinkiem', () => {
        const entry = PettyCashEntryValidator.buildAndValidate(invoiceDto());
        expect(entry.netAmount).toBe(91.85);
        expect(entry.grossAmount).toBe(112.98);
        expect(entry.expenseAmount).toBe(112.98);
    });

    it('buduje wysylke pocztowa i normalizuje numer nadania', () => {
        const entry = PettyCashEntryValidator.buildAndValidate(postalDto());
        expect(entry._dispatch?.items[0].trackingNumber).toBe(TRACKING);
        expect(entry._dispatch?.itemsTotal).toBe(9.8);
    });
});

describe('PettyCashEntryValidator - ksztalt DTO', () => {
    it('odrzuca nieznany rodzaj wpisu', () => {
        expect(errorsOf(invoiceDto({ entryKind: 'COSKOLWIEK' }))).toContainEqual(
            expect.stringContaining('Nieznany rodzaj wpisu')
        );
    });

    it('odrzuca nieznany sposob rozliczenia', () => {
        expect(errorsOf(invoiceDto({ settlementMethod: 'BLIK' }))).toContainEqual(
            expect.stringContaining('Nieznany sposob rozliczenia')
        );
    });

    it('wymaga daty, opisu i osoby placacej', () => {
        const errors = errorsOf(
            invoiceDto({ entryDate: '', description: '  ', payerLabel: '' })
        );
        expect(errors).toContainEqual(expect.stringContaining('Brak daty'));
        expect(errors).toContainEqual(expect.stringContaining('Brak opisu'));
        expect(errors).toContainEqual(expect.stringContaining('kto zaplacil'));
    });

    it('wskazuje numer listu, ktory nie przeszedl cyfry kontrolnej', () => {
        const dto = postalDto();
        (dto.dispatch as any).items[0].trackingNumber = '12345';
        expect(errorsOf(dto)).toContainEqual(
            expect.stringContaining('List 1: numer nadania jest niepoprawny')
        );
    });

    it('odrzuca wpis niepocztowy z lista listow', () => {
        expect(
            errorsOf(invoiceDto({ dispatch: postalDto().dispatch }))
        ).toContainEqual(expect.stringContaining('Tylko wpis pocztowy'));
    });

    it('odrzuca wpis pocztowy bez listy listow', () => {
        const dto = postalDto();
        delete dto.dispatch;
        expect(errorsOf(dto)).toContainEqual(
            expect.stringContaining('wymaga listy wyslanych listow')
        );
    });
});

describe('PettyCashEntryValidator - reguly domenowe', () => {
    it('przepuszcza reguly z modelu, zamiast powtarzac je u siebie', () => {
        expect(errorsOf(invoiceDto({ inflowAmount: '10,00' }))).toContainEqual(
            expect.stringContaining('rowna wydatkowi')
        );
    });

    it('wychwytuje sume listow niezgodna z kwota faktury', () => {
        const dto = postalDto();
        dto.grossAmount = '19,60';
        dto.netAmount = '19,60';
        expect(errorsOf(dto)).toContainEqual(expect.stringContaining('Roznica'));
    });
});
