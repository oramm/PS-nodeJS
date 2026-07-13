// Mock dependencies - Jest will use __mocks__ folder automatically
jest.mock('../OfferRepository');
jest.mock('../offerEvent/OfferEventsController');
jest.mock('../../persons/PersonsController');
jest.mock('../../entities/EntitiesController');

import OffersController from '../OffersController';
import OfferRepository from '../OfferRepository';
import OurOffer from '../OurOffer';
import ExternalOffer from '../ExternalOffer';
import OfferEventsController from '../offerEvent/OfferEventsController';
import PersonsController from '../../persons/PersonsController';
import EntitiesController from '../../entities/EntitiesController';
import { OAuth2Client } from 'google-auth-library';
import { UserData } from '../../types/sessionTypes';
import { OfferEventData } from '../../types/types';

describe('OffersController', () => {
    let mockAuth: OAuth2Client;
    let mockUserData: UserData;
    let mockOffer: OurOffer;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Setup mock OAuth2Client
        mockAuth = {} as OAuth2Client;

        // Setup mock UserData
        mockUserData = {
            systemEmail: 'test@example.com',
            userName: 'Test User',
        } as UserData;

        // Setup mock OurOffer
        mockOffer = {
            id: 1,
            alias: 'TEST-001',
            status: 'New',
            _lastEvent: null,
            createSentEvent: jest.fn(),
            markAsSent: jest.fn(),
        } as unknown as OurOffer;
    });

    describe('sendOurOffer', () => {
        it('should orchestrate sending OurOffer with correct flow', async () => {
            // Arrange
            const mockEditor = {
                id: 1,
                name: 'Editor',
                surname: 'Test',
                email: 'test@example.com',
            };
            const mockEvent = { id: 1, eventType: 'SENT' };
            const newEventData = {
                description: 'Test event',
                _editor: mockEditor,
                eventType: 'SENT',
            } as unknown as OfferEventData;

            // Mock PersonsController.getPersonFromSessionUserData
            (
                PersonsController.getPersonFromSessionUserData as jest.Mock
            ).mockResolvedValue(mockEditor);

            // Mock offer.createSentEvent
            (mockOffer.createSentEvent as jest.Mock).mockReturnValue(mockEvent);

            // Mock OfferEventsController.addNew
            (OfferEventsController.addNew as jest.Mock).mockResolvedValue(
                undefined
            );

            // Mock OfferEventsController.sendMailWithOffer
            (
                OfferEventsController.sendMailWithOffer as jest.Mock
            ).mockResolvedValue(undefined);

            // Mock OffersController.edit
            jest.spyOn(OffersController as any, 'edit').mockResolvedValue(
                undefined
            );

            // Act
            await OffersController.sendOurOffer(
                mockOffer,
                mockUserData,
                newEventData,
                mockAuth
            );

            // Assert
            // 1. Should get editor from session
            expect(
                PersonsController.getPersonFromSessionUserData
            ).toHaveBeenCalledWith(mockUserData);

            // 2. Should create SENT event
            expect(mockOffer.createSentEvent).toHaveBeenCalledWith(
                newEventData,
                mockEditor
            );

            // 3. Should save event
            expect(OfferEventsController.addNew).toHaveBeenCalledWith(
                mockEvent
            );

            // 4. Should send mail
            expect(
                OfferEventsController.sendMailWithOffer
            ).toHaveBeenCalledWith(mockAuth, mockEvent, mockOffer, [
                mockUserData.systemEmail,
            ]);

            // 5. Should mark offer as sent
            expect(mockOffer.markAsSent).toHaveBeenCalledWith(mockEvent);

            // 6. Should save status to DB
            expect(OffersController['edit']).toHaveBeenCalledWith(
                mockOffer,
                undefined,
                ['status'],
                mockAuth
            );
        });

        it('should call methods in correct order', async () => {
            // Arrange
            const callOrder: string[] = [];
            const mockEditor = { id: 1 };
            const mockEvent = { id: 1 };
            const newEventData: OfferEventData = {} as OfferEventData;

            (
                PersonsController.getPersonFromSessionUserData as jest.Mock
            ).mockImplementation(() => {
                callOrder.push('getEditor');
                return Promise.resolve(mockEditor);
            });

            (mockOffer.createSentEvent as jest.Mock).mockImplementation(() => {
                callOrder.push('createEvent');
                return mockEvent;
            });

            (OfferEventsController.addNew as jest.Mock).mockImplementation(
                () => {
                    callOrder.push('addEvent');
                    return Promise.resolve();
                }
            );

            (
                OfferEventsController.sendMailWithOffer as jest.Mock
            ).mockImplementation(() => {
                callOrder.push('sendMail');
                return Promise.resolve();
            });

            (mockOffer.markAsSent as jest.Mock).mockImplementation(() => {
                callOrder.push('markAsSent');
            });

            jest.spyOn(OffersController as any, 'edit').mockImplementation(
                () => {
                    callOrder.push('saveStatus');
                    return Promise.resolve();
                }
            );

            // Act
            await OffersController.sendOurOffer(
                mockOffer,
                mockUserData,
                newEventData,
                mockAuth
            );

            // Assert - verify exact order
            expect(callOrder).toEqual([
                'getEditor',
                'createEvent',
                'addEvent',
                'sendMail',
                'markAsSent',
                'saveStatus',
            ]);
        });

        it('should propagate errors from dependencies', async () => {
            // Arrange
            const newEventData: OfferEventData = {} as OfferEventData;
            const error = new Error('Database error');

            (
                PersonsController.getPersonFromSessionUserData as jest.Mock
            ).mockRejectedValue(error);

            // Act & Assert
            await expect(
                OffersController.sendOurOffer(
                    mockOffer,
                    mockUserData,
                    newEventData,
                    mockAuth
                )
            ).rejects.toThrow('Database error');
        });
    });

    describe('delete (dispatcher)', () => {
        it('should call deleteOurOffer for OurOffer instance', async () => {
            // Arrange
            const ourOffer = new OurOffer({
                alias: 'TEST-001',
                _type: { id: 1 },
                _city: { id: 1 },
                employerName: 'Test Employer',
            } as any);
            jest.spyOn(
                OffersController as any,
                'deleteOurOffer'
            ).mockResolvedValue(undefined);

            // Act
            await OffersController.delete(ourOffer, mockUserData, mockAuth);

            // Assert
            expect(OffersController['deleteOurOffer']).toHaveBeenCalledWith(
                mockAuth,
                ourOffer,
                mockUserData
            );
        });

        it('should call deleteExternalOffer for ExternalOffer instance', async () => {
            // Arrange
            const externalOffer = new ExternalOffer({
                alias: 'TEST-002',
                _type: { id: 1 },
                _city: { id: 1 },
                employerName: 'Test Employer',
            } as any);
            jest.spyOn(
                OffersController as any,
                'deleteExternalOffer'
            ).mockResolvedValue(undefined);

            // Act
            await OffersController.delete(externalOffer, undefined, mockAuth);

            // Assert
            expect(
                OffersController['deleteExternalOffer']
            ).toHaveBeenCalledWith(mockAuth, externalOffer);
        });

        it('should throw error for unknown offer type', async () => {
            // Arrange
            const unknownOffer = {} as any;

            // Act & Assert
            await expect(OffersController.delete(unknownOffer)).rejects.toThrow(
                'Unknown offer type'
            );
        });
    });

    describe('matchEmployerEntity', () => {
        let employerOffer: OurOffer;

        beforeEach(() => {
            employerOffer = {
                employerName: 'Gmina Warszawa',
                setEmployerDetails: jest.fn(),
            } as unknown as OurOffer;
        });

        it('should set employer details on exact case-insensitive match', async () => {
            const entity = {
                id: 5,
                name: 'gmina warszawa',
                address: 'ul. Testowa 1',
                taxNumber: '5252248481',
            };
            (EntitiesController.find as jest.Mock).mockResolvedValue([
                entity,
            ]);

            await (OffersController as any).matchEmployerEntity(
                employerOffer
            );

            expect(EntitiesController.find).toHaveBeenCalledWith([
                { name: 'Gmina Warszawa' },
            ]);
            expect(employerOffer.setEmployerDetails).toHaveBeenCalledWith(
                entity
            );
        });

        it('should not set employer details when no exact match found', async () => {
            (EntitiesController.find as jest.Mock).mockResolvedValue([
                { id: 1, name: 'Inna Nazwa Sp. z o.o.' },
            ]);

            await (OffersController as any).matchEmployerEntity(
                employerOffer
            );

            expect(employerOffer.setEmployerDetails).not.toHaveBeenCalled();
        });

        it('should deterministically pick the lowest-id entity when multiple exact matches exist', async () => {
            const older = { id: 3, name: 'Gmina Warszawa' };
            const newer = { id: 10, name: 'Gmina Warszawa' };
            (EntitiesController.find as jest.Mock).mockResolvedValue([
                newer,
                older,
            ]);

            await (OffersController as any).matchEmployerEntity(
                employerOffer
            );

            expect(employerOffer.setEmployerDetails).toHaveBeenCalledWith(
                older
            );
        });

        it('should not throw and should leave employer unset when the lookup fails', async () => {
            (EntitiesController.find as jest.Mock).mockRejectedValue(
                new Error('DB down')
            );

            await expect(
                (OffersController as any).matchEmployerEntity(employerOffer)
            ).resolves.toBeUndefined();
            expect(employerOffer.setEmployerDetails).not.toHaveBeenCalled();
        });

        it('should skip the lookup entirely when offer has no employerName', async () => {
            employerOffer.employerName = undefined;

            await (OffersController as any).matchEmployerEntity(
                employerOffer
            );

            expect(EntitiesController.find).not.toHaveBeenCalled();
        });
    });

    describe('getOffersList', () => {
        it('should delegate to repository.find', async () => {
            // Arrange
            const searchParams = [{ alias: 'TEST', offerBondStatuses: [] }];
            const mockOffers = [mockOffer];
            const mockRepository = {
                find: jest.fn().mockResolvedValue(mockOffers),
            };

            // Replace repository instance
            (OffersController as any).instance = { repository: mockRepository };

            // Act
            const result = await OffersController.find(searchParams);

            // Assert
            expect(mockRepository.find).toHaveBeenCalledWith(searchParams);
            expect(result).toBe(mockOffers);
        });
    });
});
