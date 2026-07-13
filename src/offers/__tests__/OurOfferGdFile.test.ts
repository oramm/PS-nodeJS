import OurOfferGdFile from '../OurOfferGdFIle';
import { OurOfferData } from '../../types/types';

describe('OurOfferGdFile - makeEmployerText', () => {
    function makeFile(
        employer: OurOfferData['_employer'] | undefined,
        employerName?: string
    ) {
        const data = {
            id: 1,
            creationDate: '2026-07-01',
            description: 'Test description',
            employerName,
            _employer: employer,
        } as unknown as OurOfferData;
        return new OurOfferGdFile({ enviDocumentData: data });
    }

    it('should return only the name when no entity was matched', () => {
        const file = makeFile(undefined, 'Gmina Warszawa');

        expect((file as any).makeEmployerText()).toBe('Gmina Warszawa');
    });

    it('should split the address on commas into separate lines and format the NIP', () => {
        const file = makeFile({
            name: 'Gmina Warszawa',
            address: 'ul. Testowa 1, 00-001 Warszawa',
            taxNumber: '5252248481',
        });

        expect((file as any).makeEmployerText()).toBe(
            'Gmina Warszawa\nul. Testowa 1\n00-001 Warszawa\nNIP 525-224-84-81'
        );
    });

    it('should fall back to the raw value when taxNumber does not have 10 digits', () => {
        const file = makeFile({
            name: 'Gmina Warszawa',
            taxNumber: '123',
        });

        expect((file as any).makeEmployerText()).toBe(
            'Gmina Warszawa\nNIP 123'
        );
    });

    it('should omit address/NIP lines entirely when not present on the entity', () => {
        const file = makeFile({ name: 'Gmina Warszawa' });

        expect((file as any).makeEmployerText()).toBe('Gmina Warszawa');
    });
});
