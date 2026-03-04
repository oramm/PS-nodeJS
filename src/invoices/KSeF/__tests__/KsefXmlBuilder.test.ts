jest.mock('../../../setup/Setup', () => ({
    __esModule: true,
    default: {
        KSeF: {
            nip: '1234567890',
            seller: {
                name: 'ENVI Sp. z o.o.',
                street: 'ul. Lubicz 25',
                city: 'Kraków',
                postalCode: '31-503',
                bankAccount: 'PL61109010140000071219812874',
                bankName: 'Test Bank',
            },
        },
    },
}));

import KsefXmlBuilder from '../KsefXmlBuilder';

describe('KsefXmlBuilder FA(3) payment and sale date mapping', () => {
    const makeInvoice = (overrides: any = {}) => ({
        id: 1,
        number: 'FV/1/2026',
        issueDate: '2026-03-01',
        sentDate: '2026-03-05',
        daysToPay: 14,
        paymentDeadline: null,
        _entity: {
            name: 'Kontrahent Test',
            taxNumber: '9876543210',
            address: 'ul. Testowa 1',
        },
        _items: [
            {
                description: 'Usługa testowa',
                quantity: 1,
                unitPrice: 100,
                vatRate: 23,
            },
        ],
        ...overrides,
    });

    it('mapuje P_1 z sentDate i P_6 z issueDate', () => {
        const xml = KsefXmlBuilder.buildXml(makeInvoice() as any);

        expect(xml).toContain('<P_1>2026-03-05</P_1>');
        expect(xml).toContain('<P_6>2026-03-01</P_6>');
    });

    it('wylicza TerminPlatnosci od sentDate + daysToPay', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({ sentDate: '2026-03-10', daysToPay: 10, paymentDeadline: '2026-03-30' }) as any,
        );

        expect(xml).toContain('<Termin>2026-03-20</Termin>');
    });

    it('dodaje RachunekBankowy/NrRB i opcjonalnie NazwaBanku', () => {
        const xml = KsefXmlBuilder.buildXml(makeInvoice() as any);

        expect(xml).toContain('<NrRB>PL61109010140000071219812874</NrRB>');
        expect(xml).toContain('<NazwaBanku>Test Bank</NazwaBanku>');
    });

    it('dodaje kod pocztowy sprzedawcy w adresie z .env', () => {
        const xml = KsefXmlBuilder.buildXml(makeInvoice() as any);

        expect(xml).toContain('<AdresL2>31-503 Kraków</AdresL2>');
    });

    it('normalizuje NIP kupującego do samych cyfr', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({
                _entity: {
                    name: 'Kontrahent Test',
                    taxNumber: '987-654-32-10',
                    address: 'ul. Testowa 1',
                },
            }) as any,
        );

        expect(xml).toContain('<NIP>9876543210</NIP>');
        expect(xml).not.toContain('<NIP>987-654-32-10</NIP>');
    });
});
