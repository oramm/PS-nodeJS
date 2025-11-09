import ToolsDb from '../tools/ToolsDb';
import Offer from './Offer';
import ContractType from '../contracts/contractTypes/ContractType';
import City from '../Admin/Cities/City';
import CitiesController from '../Admin/Cities/CitiesController';
import OfferRepository, { OffersSearchParams } from './OfferRepository';
import { OAuth2Client } from 'google-auth-library';
import { UserData } from '../types/sessionTypes';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import Setup from '../setup/Setup';
import OfferEvent from './offerEvent/OfferEvent';
import OfferEventsController from './offerEvent/OfferEventsController';
import PersonsController from '../persons/PersonsController';
import OurOffer from './OurOffer';
import ExternalOffer from './ExternalOffer';
import OfferBondsController from './OfferBond/OfferBondsController';
import OurOfferGdFile from './OurOfferGdFIle';
import OfferInvitationMail from './OfferInvitationMails/OfferInvitationMail';
import ExternalOfferGdController from './gdControllers/ExternalOfferGdController';
import OfferGdController from './gdControllers/OfferGdController';
import EnviErrors from '../tools/Errors';
import { OfferEventData } from '../types/types';

export type { OffersSearchParams } from './OfferRepository';

export default class OffersController {
    private static repository = OfferRepository.getInstance();

    static async getOffersList(
        orConditions: OffersSearchParams[] = []
    ): Promise<Offer[]> {
        return await this.repository.find(orConditions);
    }

    /**
     * Add new offer - dispatches to specific implementation based on offer type
     * PUBLIC: Called by Router
     */
    static async addNew(
        auth: OAuth2Client,
        offer: Offer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        if (offer instanceof OurOffer) {
            return await this.addNewOurOffer(auth, offer, userData, taskId);
        } else if (offer instanceof ExternalOffer) {
            return await this.addNewExternalOffer(
                auth,
                offer,
                userData,
                taskId
            );
        }
        throw new Error('Unknown offer type');
    }

    /**
     * Edit offer - dispatches to specific implementation based on offer type
     * PUBLIC: Called by Router
     */
    static async edit(
        auth: OAuth2Client,
        offer: Offer,
        taskId?: string,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        if (offer instanceof OurOffer) {
            return await this.editOurOffer(auth, offer, taskId, fieldsToUpdate);
        } else if (offer instanceof ExternalOffer) {
            return await this.editExternalOffer(
                auth,
                offer,
                taskId,
                fieldsToUpdate
            );
        }
        throw new Error('Unknown offer type');
    }

    /**
     * Delete offer - dispatches to specific implementation based on offer type
     * PUBLIC: Called by Router
     */
    static async delete(
        auth: OAuth2Client,
        offer: Offer,
        userData?: UserData
    ): Promise<void> {
        if (offer instanceof OurOffer) {
            return await this.deleteOurOffer(auth, offer, userData);
        } else if (offer instanceof ExternalOffer) {
            return await this.deleteExternalOffer(auth, offer);
        }
        throw new Error('Unknown offer type');
    }

    /**
     * Send OurOffer - create SENT event and send email with offer
     * PUBLIC: Called by Router
     */
    static async sendOurOffer(
        auth: OAuth2Client,
        offer: OurOffer,
        userData: UserData,
        newEventData: OfferEventData
    ): Promise<void> {
        // 1. Get editor from session
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );

        // 2. Create SENT event (business logic delegated to Model)
        const newEvent = offer.createSentEvent(newEventData, _editor);

        // 3. Save event
        await OfferEventsController.addNew(newEvent);

        // 4. Send mail with offer
        await OfferEventsController.sendMailWithOffer(auth, newEvent, offer, [
            userData.systemEmail,
        ]);

        // 5. Update offer status (business logic delegated to Model)
        offer.markAsSent(newEvent);

        // 6. Save status to DB
        await this.edit(auth, offer, undefined, ['status']);
    }

    /**
     * Add new offer (base logic for all offer types)
     * PRIVATE: Called by addNewOurOffer/addNewExternalOffer
     */
    private static async addNewBase(
        auth: OAuth2Client,
        offer: Offer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        try {
            console.group('Creating new offer');
            TaskStore.update(taskId, 'Tworzę foldery', 15);
            await offer.createGdElements(auth);
            console.log('Offer folder created');

            TaskStore.update(taskId, 'Zapisuję ofertę do bazy', 30);
            await this.repository.addInDb(offer);
            console.log('Offer added in db');

            console.group(
                'Creating default milestones for offer submission milestone'
            );
            TaskStore.update(
                taskId,
                'Tworzę kamień milowy składania oferty',
                50
            );
            await offer.createDefaultMilestones(
                auth,
                Setup.MilestoneTypes.OFFER_SUBMISSION,
                taskId
            );

            TaskStore.update(taskId, 'Tworzę kamień milowy oceny oferty', 80);
            await offer.createOfferEvaluationMilestoneOrCases(auth);

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
            await this.delete(auth, offer);
            throw err;
        }
    }

    /**
     * Add new OurOffer (with specific logic for our offers)
     * PRIVATE: Called by addNew()
     */
    private static async addNewOurOffer(
        auth: OAuth2Client,
        offer: OurOffer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        await this.addNewBase(auth, offer, userData, taskId);
        await this.bindInvitationMail(offer, userData);
        const ourOfferGdFile = new OurOfferGdFile({
            enviDocumentData: { ...offer },
        });
        await ourOfferGdFile.moveToMakeOfferFolder(auth);
    }

    /**
     * Add new ExternalOffer (with specific logic for external offers)
     * PRIVATE: Called by addNew()
     */
    private static async addNewExternalOffer(
        auth: OAuth2Client,
        offer: ExternalOffer,
        userData: UserData,
        taskId: string
    ): Promise<void> {
        await this.addNewBase(auth, offer, userData, taskId);
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
        try {
            console.group('Editing offer');
            TaskStore.update(taskId, 'Edytuję ofertę', 5);

            if (this.shouldEditGdElements(fieldsToUpdate)) {
                TaskStore.update(taskId, 'Edytuję ofertę na Dysku Google', 20);
                await offer.editGdElements(auth, taskId);
            }
            console.log('Offer folder edited');
            TaskStore.update(taskId, 'Edytuję ofertę w bazie', 50);
            await this.repository.editInDb(
                offer,
                undefined,
                undefined,
                fieldsToUpdate
            );
            console.log('Offer edited in db');
            TaskStore.update(taskId, 'Edytuję kamienie milowe', 80);
            await offer.createOfferEvaluationMilestoneOrCases(auth);
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
        console.group('Deleting offer');
        if (!offer.gdFolderId)
            throw new EnviErrors.NoGdIdError(
                'Brak folderu oferty',
                'NO_FOLDER'
            );

        try {
            if (offer.id) await this.repository.deleteFromDb(offer);
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
        await invitationMail.editController(userData);
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
        await invitationMail.editInDb();
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
}
