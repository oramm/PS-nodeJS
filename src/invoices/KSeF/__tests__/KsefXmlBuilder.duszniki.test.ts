// F4 (checkpoint) — sibling test file, ADD-ONLY per parallel-streams hazard constraint.
// Proves KSeF FA(3) already supports the JST layout (Nabywca=gmina / Odbiorca=zaklad,
// Podmiot3 rola 8) end-to-end, for the "Nabywca/Odbiorca FV" feature (Duszniki case).
// Read-only investigation companion: does NOT modify KsefXmlBuilder.test.ts or any
// file belonging to the F1 (FV) or FIDman (DM-L1) parallel streams.

jest.mock('../../../setup/Setup', () => ({
    __esModule: true,
    default: {
        KSeF: {
            nip: '7471917575',
            seller: {
                name: 'ENVI KONSULTING s.c. Marek Gazda, Lucyna Stecuła',
                street: 'ul. Brzechwy 3',
                city: 'Brzeg',
                postalCode: '49-305',
                bankAccount: '48 1020 3668 0000 5502 0678 7115',
                bankName: 'PKO BP',
            },
        },
    },
}));

import KsefXmlBuilder from '../KsefXmlBuilder';

describe('KsefXmlBuilder — Duszniki JST layout (Nabywca=gmina, Odbiorca=zaklad rola 8)', () => {
    const GMINA_NIP = '7871995455';
    const GMINA_NAME = 'Gmina Duszniki';
    const GMINA_ADDRESS = 'ul. Sportowa 1, 64-550 Duszniki';

    const KZB_ID = 747;
    const KZB_NIP = '7871006601';
    const KZB_NAME = 'Komunalny Zakład Budżetowy';
    const KZB_ADDRESS = 'ul. Szamotulska 16, 64-550 Duszniki';

    const makeDusznikiInvoice = (overrides: any = {}) => ({
        id: 9001,
        number: 'FV/9001/2026',
        issueDate: '2026-07-01',
        sentDate: '2026-07-01',
        daysToPay: 14,
        paymentDeadline: null,
        // Podmiot2 (Nabywca) = invoice._entity, wg planu D2 wypełniane z pola umowy "Nabywca FV"
        _entity: {
            name: GMINA_NAME,
            taxNumber: GMINA_NIP,
            address: GMINA_ADDRESS,
        },
        isJstSubordinate: true,
        isGvMember: false,
        includeThirdParty: true,
        // Podmiot3 rola 8 (Odbiorca) = Zamawiajacy umowy (zaklad budzetowy), wg D2
        _thirdParties: [
            {
                entityId: KZB_ID,
                role: 8,
                _entity: {
                    id: KZB_ID,
                    name: KZB_NAME,
                    taxNumber: KZB_NIP,
                    address: KZB_ADDRESS,
                },
            },
        ],
        _items: [
            {
                description: 'Usługa wod-kan',
                quantity: 1,
                unitPrice: 500,
                vatRate: 23,
            },
        ],
        ...overrides,
    });

    it('VAT: Podmiot2 = Gmina (nabywca), Podmiot3 rola 8 = KZB (odbiorca), oba z poprawnymi NIP i adresami', () => {
        const xml = KsefXmlBuilder.buildXml(makeDusznikiInvoice() as any);

        // Podmiot2 (Nabywca) — Gmina
        expect(xml).toContain('<NIP>7871995455</NIP>');
        expect(xml).toContain(`<Nazwa>${GMINA_NAME}</Nazwa>`);
        expect(xml).toContain(`<AdresL1>${GMINA_ADDRESS}</AdresL1>`);
        expect(xml).toContain('<JST>1</JST>');

        // Podmiot3 rola 8 (Odbiorca) — KZB
        expect(xml).toContain('<Podmiot3>');
        expect(xml).toContain('<Rola>8</Rola>');
        expect(xml).toContain('<NIP>7871006601</NIP>');
        expect(xml).toContain(`<Nazwa>${KZB_NAME}</Nazwa>`);
        expect(xml).toContain(`<AdresL1>${KZB_ADDRESS}</AdresL1>`);

        // dokladnie jeden blok Podmiot3 (jeden odbiorca)
        expect(xml.match(/<Podmiot3>/g)?.length).toBe(1);

        // sanity: oba NIP-y wystepuja w dokumencie, na roznych podmiotach
        const podmiot2Section = xml.substring(xml.indexOf('<Podmiot2>'), xml.indexOf('</Podmiot2>'));
        const podmiot3Section = xml.substring(xml.indexOf('<Podmiot3>'), xml.indexOf('</Podmiot3>'));
        expect(podmiot2Section).toContain(GMINA_NIP);
        expect(podmiot2Section).not.toContain(KZB_NIP);
        expect(podmiot3Section).toContain(KZB_NIP);
        expect(podmiot3Section).not.toContain(GMINA_NIP);
    });

    it('KOR: ten sam uklad dwoch podmiotow (Gmina=Podmiot2 / KZB=Podmiot3 rola 8) na korekcie', () => {
        const xml = KsefXmlBuilder.buildCorrectionXml(
            makeDusznikiInvoice() as any,
            {
                ksefNumber: '1111111111-20260101-AAAAAA-BBBBBB-CC',
                invoiceNumber: 'FV/9001/2026',
                issueDate: '2026-07-01',
            },
            'Korekta stawki VAT',
        );

        expect(xml).toContain('<RodzajFaktury>KOR</RodzajFaktury>');

        // Podmiot2 (Nabywca) — Gmina, niezmienione wzgledem VAT
        expect(xml).toContain('<NIP>7871995455</NIP>');
        expect(xml).toContain(`<Nazwa>${GMINA_NAME}</Nazwa>`);
        expect(xml).toContain(`<AdresL1>${GMINA_ADDRESS}</AdresL1>`);
        expect(xml).toContain('<JST>1</JST>');

        // Podmiot3 rola 8 (Odbiorca) — KZB, niezmienione wzgledem VAT
        expect(xml).toContain('<Podmiot3>');
        expect(xml).toContain('<Rola>8</Rola>');
        expect(xml).toContain('<NIP>7871006601</NIP>');
        expect(xml).toContain(`<Nazwa>${KZB_NAME}</Nazwa>`);
        expect(xml).toContain(`<AdresL1>${KZB_ADDRESS}</AdresL1>`);

        expect(xml.match(/<Podmiot3>/g)?.length).toBe(1);
    });

    it('regresja: faktura non-JST (bez Podmiot3) nie dostaje przypadkiem bloku Podmiot3', () => {
        const xml = KsefXmlBuilder.buildXml(
            makeDusznikiInvoice({
                isJstSubordinate: false,
                includeThirdParty: false,
                _thirdParties: undefined,
            }) as any,
        );

        expect(xml).not.toContain('<Podmiot3>');
        expect(xml).toContain('<JST>2</JST>');
    });
});
