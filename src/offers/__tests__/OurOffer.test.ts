// Mock BusinessObject to avoid circular dependencies
jest.mock('../../BussinesObject');
// Mock dependencies - Jest will use __mocks__ folder automatically
jest.mock('../OfferRepository');

import OurOffer from '../OurOffer';
import OfferEvent from '../offerEvent/OfferEvent';
import Setup from '../../setup/Setup';
import { OfferEventData, PersonData, OurOfferData } from '../../types/types';

describe('OurOffer - Business Logic', () => {
    let offer: OurOffer;
    let mockOfferData: OurOfferData;

    beforeEach(() => {
        mockOfferData = {
            id: 1,
            alias: 'TEST-001',
            _type: { id: 1, name: 'Test Type' },
            _city: { id: 1, name: 'Warsaw' },
            isOur: true,
            _employer: { name: 'Test Employer' },
        } as OurOfferData;

        offer = new OurOffer(mockOfferData);
    });

    describe('createSentEvent', () => {
        it('should create OfferEvent with SENT type', () => {
            // Arrange
            const newEventData = {
                description: 'Offer sent to client',
            } as unknown as OfferEventData;

            const editor = {
                id: 1,
                name: 'John',
                surname: 'Doe',
                email: 'john@example.com',
            } as PersonData;

            // Act
            const result = offer.createSentEvent(newEventData, editor);

            // Assert
            expect(result).toBeInstanceOf(OfferEvent);
            expect(result.eventType).toBe(Setup.OfferEventType.SENT);
            expect(result._editor).toBe(editor);
            expect(result.offerId).toBe(offer.id);
        });

        it('should preserve all properties from newEventData', () => {
            // Arrange
            const newEventData = {
                description: 'Test description',
                _gdFilesBasicData: [{ id: '123', name: 'file.pdf' }],
            } as unknown as OfferEventData;

            const editor = { id: 1 } as unknown as PersonData;

            // Act
            const result = offer.createSentEvent(newEventData, editor);

            // Assert
            expect(result._gdFilesBasicData).toEqual([
                { id: '123', name: 'file.pdf' },
            ]);
        });

        it('should use offer.id for offerId', () => {
            // Arrange
            offer.id = 999;
            const newEventData = {} as unknown as OfferEventData;
            const editor: PersonData = { id: 1 } as PersonData;

            // Act
            const result = offer.createSentEvent(newEventData, editor);

            // Assert
            expect(result.offerId).toBe(999);
        });
    });

    describe('markAsSent', () => {
        it('should update _lastEvent and status to DONE', () => {
            // Arrange
            const mockEvent = new OfferEvent({
                id: 1,
                offerId: offer.id,
                eventType: Setup.OfferEventType.SENT,
            } as OfferEventData);

            expect(offer._lastEvent).toBeUndefined();
            expect(offer.status).not.toBe(Setup.OfferStatus.DONE);

            // Act
            offer.markAsSent(mockEvent);

            // Assert
            expect(offer._lastEvent).toBe(mockEvent);
            expect(offer.status).toBe(Setup.OfferStatus.DONE);
        });

        it('should replace previous _lastEvent', () => {
            // Arrange
            const oldEvent = new OfferEvent({
                id: 1,
                offerId: offer.id,
            } as OfferEventData);

            const newEvent = new OfferEvent({
                id: 2,
                offerId: offer.id,
            } as OfferEventData);

            offer._lastEvent = oldEvent;

            // Act
            offer.markAsSent(newEvent);

            // Assert
            expect(offer._lastEvent).toBe(newEvent);
            expect(offer._lastEvent).not.toBe(oldEvent);
        });

        it('should be idempotent - calling twice with same event should work', () => {
            // Arrange
            const mockEvent = new OfferEvent({
                id: 1,
                offerId: offer.id,
            } as OfferEventData);

            // Act
            offer.markAsSent(mockEvent);
            const firstStatus = offer.status;
            const firstEvent = offer._lastEvent;

            offer.markAsSent(mockEvent);
            const secondStatus = offer.status;
            const secondEvent = offer._lastEvent;

            // Assert
            expect(firstStatus).toBe(Setup.OfferStatus.DONE);
            expect(secondStatus).toBe(Setup.OfferStatus.DONE);
            expect(firstEvent).toBe(mockEvent);
            expect(secondEvent).toBe(mockEvent);
        });
    });

    describe('Integration: createSentEvent + markAsSent', () => {
        it('should work together for complete send flow', () => {
            // Arrange
            const newEventData = {
                description: 'Sent to client',
            } as unknown as OfferEventData;

            const editor = {
                id: 1,
                name: 'John',
                surname: 'Doe',
                email: 'john@example.com',
            } as PersonData;

            // Act
            const event = offer.createSentEvent(newEventData, editor);
            offer.markAsSent(event);

            // Assert
            expect(offer._lastEvent).toBe(event);
            expect(offer.status).toBe(Setup.OfferStatus.DONE);
            expect(offer._lastEvent?.eventType).toBe(Setup.OfferEventType.SENT);
            expect(offer._lastEvent?._editor).toBe(editor);
        });
    });
});
