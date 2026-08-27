/**
 * Komunikat dla osoby rejestrującej ofertę, gdy baza odrzuci duplikat.
 *
 * Baza pilnuje unikalności czwórki: skrót + zamawiający + data utworzenia + typ.
 * Jej własny komunikat ("Duplicate entry 'wodoc.-...' for key unique_alias_...")
 * trafiał wprost do okna w przeglądarce i nic nie mówił użytkownikowi.
 */

jest.mock('../OfferRepository');
jest.mock('../offerEvent/OfferEventsController');
jest.mock('../../persons/PersonsController');
jest.mock('../../entities/EntitiesController');

import OffersController from '../OffersController';
import Offer from '../Offer';

// translateOfferDbError jest prywatne - w teście sięgamy po nie wprost,
// żeby sprawdzić sam komunikat bez uruchamiania całej rejestracji oferty.
const translate = (
    err: unknown,
    offer: Partial<Offer>,
    operation: 'add' | 'edit' = 'add'
) =>
    (OffersController as any).translateOfferDbError(
        err,
        offer,
        operation
    ) as Error;

const offer = {
    alias: 'wodoc.',
    employerName: 'Toruńskie Wodociągi Sp. z o.o.',
    creationDate: '2026-08-20',
    _type: { name: 'IK' },
} as Partial<Offer>;

const duplicateError = Object.assign(
    new Error(
        "Duplicate entry 'wodoc.-Toruńskie Wodociągi Sp. z o.o.-2026-08-20-1' for key 'unique_alias_employername_creationdate_typeid'"
    ),
    { errno: 1062, code: 'ER_DUP_ENTRY' }
);

describe('OffersController - duplikat oferty', () => {
    it('nazywa ofertę cechami zrozumiałymi dla człowieka', () => {
        const message = translate(duplicateError, offer).message;

        expect(message).toContain('wodoc.');
        expect(message).toContain('Toruńskie Wodociągi Sp. z o.o.');
        expect(message).toContain('20-08-2026');
        expect(message).toContain('IK');
        expect(message).toContain('jest już zarejestrowana');
    });

    it('nie pokazuje surowego komunikatu bazy', () => {
        const message = translate(duplicateError, offer).message;

        expect(message).not.toContain('Duplicate entry');
        expect(message).not.toContain('unique_alias');
    });

    it('podpowiada, że oferta mogła zostać zapisana mimo wcześniejszego błędu', () => {
        const message = translate(duplicateError, offer).message;

        expect(message).toMatch(/mogła zostać zapisana/);
    });

    it('przy edycji podpowiada, którą cechę zmienić - bez tropu o wcześniejszej próbie', () => {
        const message = translate(duplicateError, offer, 'edit').message;

        expect(message).toContain('jest już zarejestrowana');
        expect(message).toMatch(/Zmień skrót, zamawiającego, datę utworzenia albo typ/);
        expect(message).not.toMatch(/mogła zostać zapisana/);
    });

    it('przepuszcza bez zmian błędy bazy, których nie potrafi nazwać', () => {
        const otherError = Object.assign(new Error('Connection lost'), {
            errno: 2013,
        });

        expect(translate(otherError, offer)).toBe(otherError);
    });
});
