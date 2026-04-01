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

    it('mapuje pola JST/GV z checkboxów faktury', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({
                isJstSubordinate: true,
                isGvMember: false,
            }) as any,
        );

        expect(xml).toContain('<JST>1</JST>');
        expect(xml).toContain('<GV>2</GV>');
    });

    it('używa domyślnych wartości JST/GV gdy pola nie są ustawione', () => {
        const xml = KsefXmlBuilder.buildXml(makeInvoice({}) as any);

        expect(xml).toContain('<JST>2</JST>');
        expect(xml).toContain('<GV>2</GV>');
    });

    it('mapuje JST/GV także dla faktury korygującej', () => {
        const xml = KsefXmlBuilder.buildCorrectionXml(
            makeInvoice({
                isJstSubordinate: true,
                isGvMember: true,
            }) as any,
            {
                ksefNumber: '1111111111-20260101-AAAAAA-BBBBBB-CC',
                invoiceNumber: 'FV/1/2026',
                issueDate: '2026-01-01',
            },
        );

        expect(xml).toContain('<JST>1</JST>');
        expect(xml).toContain('<GV>1</GV>');
    });

    it('dodaje Podmiot3 z rolą 8 gdy JST=1', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({
                isJstSubordinate: true,
                isGvMember: false,
                includeThirdParty: true,
                _thirdParties: [
                    {
                        entityId: 77,
                        role: 8,
                        _entity: {
                            id: 77,
                            name: 'Jednostka JST',
                            taxNumber: '123-456-32-18',
                            address: 'ul. JST 5',
                        },
                    },
                ],
            }) as any,
        );

        expect(xml).toContain('<Podmiot3>');
        expect(xml).toContain('<Rola>8</Rola>');
        expect(xml).toContain('<NIP>1234563218</NIP>');
    });

    it('dodaje Podmiot3 z rolą 10 gdy GV=1', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({
                isJstSubordinate: false,
                isGvMember: true,
                includeThirdParty: true,
                _thirdParties: [
                    {
                        entityId: 88,
                        role: 10,
                        _entity: {
                            id: 88,
                            name: 'Członek GV',
                            taxNumber: '',
                            address: 'ul. GV 10',
                        },
                    },
                ],
            }) as any,
        );

        expect(xml).toContain('<Podmiot3>');
        expect(xml).toContain('<Rola>10</Rola>');
        expect(xml).toContain('<IDWew>88</IDWew>');
        expect(xml).toContain('<Nazwa>Członek GV</Nazwa>');
    });

    it('dodaje Podmiot3 z domyślną rolą 10 także bez JST/GV', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({
                isJstSubordinate: false,
                isGvMember: false,
                includeThirdParty: true,
                _thirdParties: [
                    {
                        entityId: 99,
                        role: 10,
                        _entity: {
                            id: 99,
                            name: 'Podmiot dodatkowy',
                            taxNumber: '',
                            address: 'ul. Dodatkowa 3',
                        },
                    },
                ],
            }) as any,
        );

        expect(xml).toContain('<Podmiot3>');
        expect(xml).toContain('<Rola>10</Rola>');
        expect(xml).toContain('<IDWew>99</IDWew>');
        expect(xml).toContain('<Nazwa>Podmiot dodatkowy</Nazwa>');
    });

    it('dodaje wiele sekcji Podmiot3 z różnymi rolami', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeInvoice({
                includeThirdParty: true,
                _thirdParties: [
                    {
                        entityId: 51,
                        role: 4,
                        _entity: {
                            id: 51,
                            name: 'Dodatkowy nabywca 1',
                            taxNumber: '1111111111',
                            address: 'ul. Pierwsza 1',
                        },
                    },
                    {
                        entityId: 52,
                        role: 6,
                        _entity: {
                            id: 52,
                            name: 'Płatnik zastępczy',
                            taxNumber: '2222222222',
                            address: 'ul. Druga 2',
                        },
                    },
                ],
            }) as any,
        );

        expect(xml.match(/<Podmiot3>/g)?.length).toBe(2);
        expect(xml).toContain('<Rola>4</Rola>');
        expect(xml).toContain('<Rola>6</Rola>');
    });
});
