import { OAuth2Client } from 'google-auth-library';
import BaseController from '../controllers/BaseController';
import CitiesController from '../Admin/Cities/CitiesController';
import Milestone from '../contracts/milestones/Milestone';
import MilestonesController from '../contracts/milestones/MilestonesController';
import CasesController from '../contracts/milestones/cases/CasesController';
import MilestoneTemplatesController from '../contracts/milestones/milestoneTemplates/MilestoneTemplatesController';
import PersonsController from '../persons/PersonsController';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import Setup from '../setup/Setup';
import EnviErrors from '../tools/Errors';
import ToolsDb from '../tools/ToolsDb';
import { UserData } from '../types/sessionTypes';
import { MilestoneDateData, OfferEventData } from '../types/types';
import ExternalOffer from './ExternalOffer';
import Offer from './Offer';
import OfferBondsController from './OfferBond/OfferBondsController';
import OfferInvitationMail from './OfferInvitationMails/OfferInvitationMail';
import OfferInvitationMailsController from './OfferInvitationMails/OfferInvitationMailsController';
import OfferRepository, { OffersSearchParams } from './OfferRepository';
import OurOffer from './OurOffer';
import OurOfferGdFile from './OurOfferGdFIle';
import ExternalOfferGdController from './gdControllers/ExternalOfferGdController';
import OfferGdController from './gdControllers/OfferGdController';
import OfferEvent from './offerEvent/OfferEvent';
import OfferEventsController from './offerEvent/OfferEventsController';
import { off } from 'process';

export type { OffersSearchParams } from './OfferRepository';

/**
 * Controller dla Offer - warstwa orkiestracji
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseController<Offer, OfferRepository>
 * - Orkiestruje operacje biznesowe
 * - Deleguje do Repository dla operacji DB
 * - Używa withAuth dla operacji wymagających OAuth
 */
export default class OffersController extends BaseController<
    Offer,
    OfferRepository
> {
    private static instance: OffersController;

    constructor() {
        super(OfferRepository.getInstance());
    }

    // Singleton pattern
    private static getInstance(): OffersController {
        if (!this.instance) {
            this.instance = new OffersController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę Offers według podanych warunków
     *
     * REFAKTORING: Zgodnie z konwencją CRUD - find() zamiast getOffersList()
     * Controller tylko orkiestruje - Repository obsługuje SQL i mapowanie
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<Offer[]> - Lista znalezionych Offers
     */
    static async find(
        orConditions: OffersSearchParams[] = []
    ): Promise<Offer[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * API PUBLICZNE - Dodaje nową ofertę
     *
     * Przepływ:
     * 1. withAuth pobiera OAuth token (lub używa przekazanego)
     * 2. Dispatcher kieruje do addOurOffer lub addExternalOffer
     * 3. Model tworzy foldery GD
     * 4. Repository zapisuje do DB
     * 5. Controller tworzy domyślne milestones
     *
     * @param offer - Offer do dodania (OurOffer lub ExternalOffer)
     * @param userData - Dane użytkownika z sesji
     * @param taskId - ID zadania dla progress tracking
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze nowy)
     * @returns Dodana Offer
     */
    static async add(
        offer: Offer,
        userData: UserData,
        taskId: string,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (instance: OffersController, auth: OAuth2Client) => {
                if (offer instanceof OurOffer) {
                    return await this.addOurOffer(
                        auth,
                        offer,
                        userData,
                        taskId
                    );
                } else if (offer instanceof ExternalOffer) {
                    return await this.addExternalOffer(
                        auth,
                        offer,
                        userData,
                        taskId
                    );
                }
                throw new Error('Unknown offer type');
            },
            auth
        );
    }

    /**
     * API PUBLICZNE - Edytuje ofertę
     *
     * Przepływ:
     * 1. withAuth pobiera OAuth token (lub używa przekazanego)
     * 2. Dispatcher kieruje do editOurOffer lub editExternalOffer
     * 3. Model edytuje foldery GD
     * 4. Repository zapisuje do DB
     *
     * @param offer - Offer do edycji (OurOffer lub ExternalOffer)
     * @param taskId - ID zadania dla progress tracking
     * @param fieldsToUpdate - Lista pól do aktualizacji
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze nowy)
     * @returns void
     */
    static async edit(
        offer: Offer,
        taskId?: string,
        fieldsToUpdate?: string[],
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (_instance: OffersController, authClient: OAuth2Client) => {
                if (offer instanceof OurOffer) {
                    return await this.editOurOffer(
                        authClient,
                        offer,
                        taskId,
                        fieldsToUpdate
                    );
                } else if (offer instanceof ExternalOffer) {
                    return await this.editExternalOffer(
                        authClient,
                        offer,
                        taskId,
                        fieldsToUpdate
                    );
                }
                throw new Error('Unknown offer type');
            },
            auth
        );
    }

    /**
     * API PUBLICZNE - Usuwa ofertę
     *
     * Przepływ:
     * 1. withAuth pobiera OAuth token (lub używa przekazanego)
     * 2. Dispatcher kieruje do deleteOurOffer lub deleteExternalOffer
     * 3. Repository usuwa z DB
     * 4. Model usuwa foldery GD
     *
     * @param offer - Offer do usunięcia (OurOffer lub ExternalOffer)
     * @param userData - Dane użytkownika z sesji (opcjonalne, dla OurOffer)
     * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze nowy)
     * @returns void
     */
    static async delete(
        offer: Offer,
        userData?: UserData,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (_instance: OffersController, authClient: OAuth2Client) => {
                if (offer instanceof OurOffer) {
                    return await this.deleteOurOffer(
                        authClient,
                        offer,
                        userData
                    );
                } else if (offer instanceof ExternalOffer) {
                    return await this.deleteExternalOffer(authClient, offer);
                }
                throw new Error('Unknown offer type');
            },
            auth
        );
    }

    /**
     * API PUBLICZNE - Wysyła OurOffer
     *
     * Przepływ:
     * 1. withAuth pobiera OAuth token (lub używa przekazanego)
     * 2. Tworzy event SENT
     * 3. Wysyła email z ofertą
     * 4. Aktualizuje status oferty
     *
     * @param offer - OurOffer do wysłania
     * @param userData - Dane użytkownika z sesji
     * @param newEventData - Dane nowego wydarzenia
     * @param auth - Opcjonalny OAuth2Client
     * @returns void
     */
    static async sendOurOffer(
        offer: OurOffer,
        userData: UserData,
        newEventData: OfferEventData,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (_instance: OffersController, authClient: OAuth2Client) => {
                // 1. Get editor from session
                const _editor =
                    await PersonsController.getPersonFromSessionUserData(
                        userData
                    );

                // 2. Create SENT event (business logic delegated to Model)
                const newEvent = offer.createSentEvent(newEventData, _editor);

                // 3. Save event
                await OfferEventsController.addNew(newEvent);

                // 4. Send mail with offer
                await OfferEventsController.sendMailWithOffer(
                    authClient,
                    newEvent,
                    offer,
                    [userData.systemEmail]
                );

                // 5. Update offer status (business logic delegated to Model)
                offer.markAsSent(newEvent);

                // 6. Save status to DB (przekazujemy authClient bo już go mamy)
                await this.edit(offer, undefined, ['status'], authClient);
            },
            auth
        );
    }

    /**
     * Add new offer (base logic for all offer types)
     * PRIVATE: Called by addOurOffer/addExternalOffer
     */
    private static async addBase(
        auth: OAuth2Client,
        offer: Offer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        const instance = this.getInstance();
        try {
            console.group('Creating new offer');
            TaskStore.update(taskId, 'Tworzę foldery', 15);
            await offer.createGdElements(auth);
            console.log('Offer folder created');

            TaskStore.update(taskId, 'Zapisuję ofertę do bazy', 30);
            await instance.repository.addInDb(offer);
            console.log('Offer added in db');

            console.group(
                'Creating default milestones for offer submission milestone'
            );
            TaskStore.update(
                taskId,
                'Tworzę kamień milowy składania oferty',
                50
            );
            await OffersController.createDefaultMilestones(
                offer,
                auth,
                Setup.MilestoneTypes.OFFER_SUBMISSION,
                taskId
            );

            TaskStore.update(taskId, 'Tworzę kamień milowy oceny oferty', 80);
            await OffersController.createOfferEvaluationMilestoneOrCases(
                offer,
                auth
            );

            const _editor =
                await PersonsController.getPersonFromSessionUserData(userData);
            offer._lastEvent = new OfferEvent({
                offerId: offer.id as number,
                eventType: Setup.OfferEventType.CREATED,
                _editor,
            });

            TaskStore.update(taskId, 'Zapisuję nowe wydarzenie dla oferty', 95);
            await OfferEventsController.addNew(offer._lastEvent);
            console.groupEnd();
        } catch (err) {
            // Rollback: usuń ofertę przy błędzie (przekazujemy auth bo już go mamy)
            await this.delete(offer, undefined, auth);
            throw err;
        }
    }

    /**
     * Add OurOffer (with specific logic for our offers)
     * PRIVATE: Called by addInternal()
     */
    private static async addOurOffer(
        auth: OAuth2Client,
        offer: OurOffer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        await this.addBase(auth, offer, userData, taskId);
        await this.bindInvitationMail(offer, userData);
        const ourOfferGdFile = new OurOfferGdFile({
            enviDocumentData: { ...offer },
        });
        await ourOfferGdFile.moveToMakeOfferFolder(auth);
    }

    /**
     * Add ExternalOffer (with specific logic for external offers)
     * PRIVATE: Called by addInternal()
     */
    private static async addExternalOffer(
        auth: OAuth2Client,
        offer: ExternalOffer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        await this.addBase(auth, offer, userData, taskId);
        const offerGdController = new ExternalOfferGdController();
        const { offerContentFolder, specsFolder } =
            await offerGdController.createExternalOfferFolders(auth, {
                ...offer,
            });
        //musi być po utworzeniu cases w bazie danych
        await offerGdController.moveFoldersToMakeOfferFolder(
            auth,
            { ...offer },
            offerContentFolder,
            specsFolder
        );
    }

    /**
     * Edit offer (base logic for all offer types)
     * PRIVATE: Called by editOurOffer/editExternalOffer
     */
    private static async editBase(
        auth: OAuth2Client,
        offer: Offer,
        taskId?: string,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        const instance = this.getInstance();
        try {
            console.group('Editing offer');
            TaskStore.update(taskId, 'Edytuję ofertę', 5);

            if (this.shouldEditGdElements(fieldsToUpdate)) {
                TaskStore.update(taskId, 'Edytuję ofertę na Dysku Google', 20);
                await offer.editGdElements(auth, taskId);
            }
            console.log('Offer folder edited');
            TaskStore.update(taskId, 'Edytuję ofertę w bazie', 50);
            await instance.repository.editInDb(
                offer,
                undefined,
                undefined,
                fieldsToUpdate
            );
            console.log('Offer edited in db');
            TaskStore.update(taskId, 'Edytuję kamienie milowe', 80);
            await OffersController.createOfferEvaluationMilestoneOrCases(
                offer,
                auth
            );
            console.log('Offer succesfully edited');
            console.groupEnd();
        } catch (err) {
            console.log('Offer edit error');
            throw err;
        }
    }

    /**
     * Edit OurOffer (base logic - no specific extensions needed)
     * PRIVATE: Called by edit()
     */
    private static async editOurOffer(
        auth: OAuth2Client,
        offer: OurOffer,
        taskId?: string,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        await this.editBase(auth, offer, taskId, fieldsToUpdate);
    }

    /**
     * Edit ExternalOffer (with specific logic for external offers)
     * PRIVATE: Called by edit()
     */
    private static async editExternalOffer(
        auth: OAuth2Client,
        offer: ExternalOffer,
        taskId?: string,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        await this.editBase(auth, offer, taskId, fieldsToUpdate);
        if (offer._offerBond) {
            offer._offerBond.status = Setup.OfferBondStatus.DONE;
            await OfferBondsController.edit(offer._offerBond, offer);
        }
    }

    /**
     * Helper: Check if GD elements should be edited
     */
    private static shouldEditGdElements(
        fieldsToUpdate: string[] | undefined
    ): boolean {
        console.log('shouldEditGdElements', fieldsToUpdate);
        if (!fieldsToUpdate) return true;
        return fieldsToUpdate.includes('submissionDeadline');
    }

    /**
     * Delete offer (base logic for all offer types)
     * PRIVATE: Called by deleteOurOffer/deleteExternalOffer
     */
    private static async deleteBase(
        auth: OAuth2Client,
        offer: Offer
    ): Promise<void> {
        const instance = this.getInstance();
        console.group('Deleting offer');
        if (!offer.gdFolderId)
            throw new EnviErrors.NoGdIdError(
                'Brak folderu oferty',
                'NO_FOLDER'
            );

        try {
            if (offer.id) await instance.repository.deleteFromDb(offer);
            console.log('Offer deleted from db');
        } catch (err) {
            console.error('Failed to delete from db:', err);
            if (err instanceof Error) {
                // Przekształcenie komunikatu błędu
                let userFriendlyMessage =
                    'Wystąpił błąd podczas usuwania oferty.';
                let errorCode = 'DB_ERROR';
                if ('errno' in err && err.errno === 1451) {
                    userFriendlyMessage =
                        'Nie można usunąć oferty, ponieważ są dla niej zarejestrowane pisma. \n\n Aby usunąć ofertę należy najpierw usunąć wszystkie pisma z nią związane.';
                    errorCode = 'FOREIGN_KEY_CONSTRAINT';
                }
                throw new EnviErrors.DbError(userFriendlyMessage, errorCode);
            }
            throw err; // Rzucenie pierwotnego błędu, jeśli nie jest to instancja Error
        }

        try {
            const offerGdController = new OfferGdController();
            await offerGdController.deleteFromGd(auth, offer.gdFolderId);
            console.log('Offer folder deleted');
        } catch (err) {
            console.error('Failed to delete from Google Drive:', err);
            throw new EnviErrors.NoGdIdError(
                'Błąd podczas usuwania folderu z Google Drive.'
            );
        }

        console.groupEnd();
    }

    /**
     * Delete OurOffer (with specific logic for OurOffer - unbind invitation mail)
     * PRIVATE: Called by delete()
     */
    private static async deleteOurOffer(
        auth: OAuth2Client,
        offer: OurOffer,
        userData?: UserData
    ): Promise<void> {
        await ToolsDb.transaction(async () => {
            if (userData) await this.unbindInvitationMail(offer, userData);
            await this.deleteBase(auth, offer);
        });
    }

    /**
     * Delete ExternalOffer (base logic - no specific extensions needed)
     * PRIVATE: Called by delete()
     */
    private static async deleteExternalOffer(
        auth: OAuth2Client,
        offer: ExternalOffer
    ): Promise<void> {
        await this.deleteBase(auth, offer);
    }

    /**
     * Helper: Unbind invitation mail from OurOffer
     */
    private static async unbindInvitationMail(
        offer: OurOffer,
        userData: UserData
    ): Promise<void> {
        if (offer._invitationMail === undefined) return;
        const invitationMail = new OfferInvitationMail({
            ...offer._invitationMail,
            status: Setup.OfferInvitationMailStatus.NEW,
        });
        OfferInvitationMailsController.edit(invitationMail, userData);
        offer.invitationMailId = null;
        offer._invitationMail = undefined;
    }

    /**
     * Helper: Bind invitation mail to OurOffer
     */
    private static async bindInvitationMail(
        offer: OurOffer,
        userData: UserData
    ): Promise<void> {
        if (offer._invitationMail === undefined) return;
        const invitationMail = new OfferInvitationMail({
            ...offer._invitationMail,
            _ourOfferId: offer.id,
            status: Setup.OfferInvitationMailStatus.DONE,
        });
        await OfferInvitationMailsController.edit(invitationMail, userData);
    }

    /**
     * Tworzy domyślne milestones dla oferty
     * PRZENIESIONE z Offer.ts - Controller może znać inne Controllers
     */
    static async createDefaultMilestones(
        offer: Offer,
        auth: OAuth2Client,
        milestoneTypeId: number,
        taskId?: string
    ): Promise<Milestone[]> {
        const defaultMilestones: Milestone[] = [];

        const defaultMilestoneTemplates =
            await MilestoneTemplatesController.find(
                {
                    isDefaultOnly: true,
                    contractTypeId: offer.typeId,
                    milestoneTypeId,
                },
                'OFFER'
            );

        for (let i = 0; i < defaultMilestoneTemplates.length; i++) {
            const template = defaultMilestoneTemplates[i];
            TaskStore.update(taskId, 'Tworzę kamień milowy', i * 15);
            const milestone = new Milestone({
                name: template.name,
                description: template.description,
                _type: template._milestoneType,
                _offer: offer as any,
                status: 'Nie rozpoczęty',
                _dates: [
                    {
                        endDate: i
                            ? <string>offer.submissionDeadline
                            : offer.setBidValidityDate(),
                    } as MilestoneDateData,
                ],
            });

            await MilestonesController.createFolders(milestone, auth);
            defaultMilestones.push(milestone);
        }
        console.log('Milestones folders created');

        // Zapisz Milestones do DB i utwórz Cases z Tasks (spójna struktura)
        await MilestonesController.addBulkWithDatesAndCases(
            defaultMilestones,
            auth,
            { isPartOfBatch: true }
        );
        console.log('Milestones with Cases and Tasks created');

        return defaultMilestones;
    }

    static async makeNewCityObject(name: string) {
        const cityData = { name: name };
        const newCity = await CitiesController.addNewCity(cityData);
        console.log(
            'City added inDB with generated code:',
            newCity.name,
            newCity.code
        );
        return newCity;
    }

    /**
     * Tworzy lub usuwa milestone oceny oferty w zależności od statusu oferty.
     * PRZENIESIONE z Offer.ts - Controller orkiestruje inne Controllery
     *
     * Logika:
     * - Jeśli status = NOT_INTERESTED lub DECISION_PENDING → usuń milestone (jeśli istnieje)
     * - Jeśli milestone nie istnieje → utwórz go
     * - Jeśli milestone istnieje bez spraw → utwórz domyślne sprawy
     *
     * @param offer - Oferta dla której tworzymy/usuwamy milestone
     * @param auth - OAuth2Client dla operacji GD
     */
    static async createOfferEvaluationMilestoneOrCases(
        offer: Offer,
        auth: OAuth2Client
    ): Promise<void> {
        const offerEvaluationMilestone = await this.getOfferEvaluationMilestone(
            offer
        );

        if (
            offer.status === Setup.OfferStatus.NOT_INTERESTED ||
            offer.status === Setup.OfferStatus.DECISION_PENDING
        ) {
            if (offerEvaluationMilestone) {
                await this.deleteOfferEvaluationMilestone(
                    offerEvaluationMilestone,
                    auth
                );
            }
            return;
        }
        if (!offerEvaluationMilestone) {
            await this.createOfferEvaluationMilestone(offer, auth);
            return;
        }

        await this.ensureDefaultCases(offer, offerEvaluationMilestone, auth);
    }

    /**
     * Pobiera milestone oceny oferty
     * PRYWATNA: Pomocnicza dla createOfferEvaluationMilestoneOrCases
     */
    private static async getOfferEvaluationMilestone(
        offer: Offer
    ): Promise<Milestone | undefined> {
        return (
            await MilestonesController.find(
                [
                    {
                        typeId: Setup.MilestoneTypes.OFFER_EVALUATION,
                        offerId: offer.id,
                    },
                ],
                'OFFER'
            )
        )[0];
    }

    /**
     * Tworzy milestone oceny oferty
     * PRYWATNA: Pomocnicza dla createOfferEvaluationMilestoneOrCases
     */
    private static async createOfferEvaluationMilestone(
        offer: Offer,
        auth: OAuth2Client
    ): Promise<void> {
        console.log('Creating milestone for offer evaluation');
        await this.createDefaultMilestones(
            offer,
            auth,
            Setup.MilestoneTypes.OFFER_EVALUATION
        );
    }

    /**
     * Usuwa milestone oceny oferty
     * PRYWATNA: Pomocnicza dla createOfferEvaluationMilestoneOrCases
     */
    private static async deleteOfferEvaluationMilestone(
        milestone: Milestone,
        auth: OAuth2Client
    ): Promise<void> {
        await MilestonesController.delete(milestone, auth);
    }

    /**
     * Upewnia się, że milestone ma domyślne sprawy
     * PRYWATNA: Pomocnicza dla createOfferEvaluationMilestoneOrCases
     */
    private static async ensureDefaultCases(
        offer: Offer,
        milestone: Milestone,
        auth: OAuth2Client
    ): Promise<void> {
        const offerEvaluationCases = await CasesController.find([
            {
                offerId: offer.id,
                milestoneTypeId: Setup.MilestoneTypes.OFFER_EVALUATION,
            },
        ]);

        if (offerEvaluationCases.length === 0) {
            await MilestonesController.createDefaultCases(milestone, auth, {
                isPartOfBatch: false,
            });
        }
    }

    /**
     * API PUBLICZNE - Eksportuje ofertę do PDF
     *
     * @param offer - OurOffer do eksportu
     * @param auth - Opcjonalny OAuth2Client
     * @returns void
     */
    static async exportOfferToPDF(
        offer: OurOffer,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (_instance: OffersController, authClient: OAuth2Client) => {
                await offer.exportToPDF(authClient);
            },
            auth
        );
    }

    /**
     * API PUBLICZNE - Pobiera dane plików z folderu GD oferty
     *
     * @param offer - Offer (OurOffer) z której pobieramy pliki
     * @param auth - Opcjonalny OAuth2Client
     * @returns Lista plików z metadanymi
     */
    static async getOfferFilesData(
        offer: OurOffer,
        auth?: OAuth2Client
    ): Promise<any[]> {
        return await this.withAuth<any[]>(
            async (_instance: OffersController, authClient: OAuth2Client) => {
                return await offer.getOfferFilesData(authClient);
            },
            auth
        );
    }
}
