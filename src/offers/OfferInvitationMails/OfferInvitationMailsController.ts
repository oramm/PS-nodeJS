import BaseController from '../../controllers/BaseController';
import OfferInvitationMail from './OfferInvitationMail';
import OfferInvitationMailRepository from './OfferInvitationMailRepository';
import { UserData } from '../../types/sessionTypes';
import PersonsController from '../../persons/PersonsController';
import Setup from '../../setup/Setup';
import ToolsMail from '../../tools/ToolsMail';

type MailSearchParams = {
    id?: number;
    uid?: number;
    editorId?: number;
    statuses?: string[];
    searchText?: string;
};

export default class OfferInvitationMailsController extends BaseController<
    OfferInvitationMail,
    OfferInvitationMailRepository
> {
    private static instance: OfferInvitationMailsController;

    constructor() {
        super(new OfferInvitationMailRepository());
    }

    private static getInstance(): OfferInvitationMailsController {
        if (!this.instance) {
            this.instance = new OfferInvitationMailsController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje maile z zaproszeniami do ofert
     */
    static async find(
        orConditions: MailSearchParams[] = []
    ): Promise<OfferInvitationMail[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * Dodaje nowy mail do bazy danych
     */
    static async add(
        mail: OfferInvitationMail,
        userData: UserData
    ): Promise<OfferInvitationMail> {
        const instance = this.getInstance();

        try {
            console.group('Creating new OfferInvitationMail');

            const _editor =
                await PersonsController.getPersonFromSessionUserData(userData);
            mail._editor = _editor;
            mail.editorId = _editor.id;
            mail.status = Setup.OfferInvitationMailStatus.NEW;

            if (!mail.body) {
                mail.body = (await ToolsMail.getEmailDetails(mail.uid))?.body;
            }

            await instance.repository.addInDb(mail);

            console.log('OfferInvitationMail added to db');
            console.groupEnd();

            return mail;
        } catch (err) {
            console.error('Error adding OfferInvitationMail:', err);
            throw err;
        }
    }

    /**
     * Edytuje istniejący mail w bazie danych
     */
    static async edit(
        mail: OfferInvitationMail,
        userData: UserData
    ): Promise<OfferInvitationMail> {
        const instance = this.getInstance();

        try {
            console.group('Editing OfferInvitationMail');

            const _editor =
                await PersonsController.getPersonFromSessionUserData(userData);
            mail._editor = _editor;
            mail.editorId = _editor.id;

            await instance.repository.editInDb(mail);

            console.log('OfferInvitationMail edited in db');
            console.groupEnd();

            return mail;
        } catch (err) {
            console.error('Error editing OfferInvitationMail:', err);
            throw err;
        }
    }

    /**
     * Usuwa mail z bazy danych
     */
    static async delete(mail: OfferInvitationMail): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(mail);
    }
}
