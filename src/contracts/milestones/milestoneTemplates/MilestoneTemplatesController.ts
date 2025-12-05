import BaseController from '../../../controllers/BaseController';
import MilestoneTemplateRepository, {
    MilestoneTemplatesSearchParams,
} from './MilestoneTemplateRepository';
import MilestoneTemplate from './MilestoneTemplate';
import { OAuth2Client } from 'google-auth-library';
import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import PersonsController from '../../../persons/PersonsController';
import { UserData } from '../../../types/sessionTypes';

/**
 * Controller dla MilestoneTemplate - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model, transakcje)
 * - Zarządza transakcjami bazodanowymi
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 */
export default class MilestoneTemplatesController extends BaseController<
    MilestoneTemplate,
    MilestoneTemplateRepository
> {
    private static instance: MilestoneTemplatesController;

    constructor() {
        super(new MilestoneTemplateRepository());
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): MilestoneTemplatesController {
        if (!this.instance) {
            this.instance = new MilestoneTemplatesController();
        }
        return this.instance;
    }

    // ==================== READ ====================

    /**
     * Wyszukuje szablony kamieni milowych
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @param templateType - Opcjonalny typ szablonu (CONTRACT | OFFER)
     * @returns Promise<MilestoneTemplate[]>
     */
    static async find(
        searchParams: MilestoneTemplatesSearchParams = {},
        templateType?: 'CONTRACT' | 'OFFER'
    ): Promise<MilestoneTemplate[]> {
        console.log('MilestoneTemplatesController.find()');
        console.log('searchParams', searchParams);
        console.log('templateType', templateType);

        const instance = this.getInstance();

        // Dodaj templateType do searchParams jeśli przekazany
        const params = {
            ...searchParams,
            ...(templateType && { templateType }),
        };

        return await instance.repository.find(params);
    }

    // ==================== ADD ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowy MilestoneTemplate do bazy danych
     *
     * UWAGA: MilestoneTemplate NIE ma operacji GD, więc NIE wymaga OAuth
     * Metoda przygotowana do przyszłego rozszerzenia (auth jako opcjonalny parametr)
     *
     * @param item - MilestoneTemplate do dodania
     * @param auth - Opcjonalny OAuth2Client (obecnie nieużywany)
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneTemplate> - Dodany obiekt
     */
    static async add(
        item: MilestoneTemplate,
        auth?: OAuth2Client,
        userData?: UserData
    ): Promise<MilestoneTemplate> {
        const instance = this.getInstance();
        return await instance.addItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje MilestoneTemplate do bazy danych
     *
     * @param item - MilestoneTemplate do dodania
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneTemplate> - Dodany obiekt
     */
    private async addItem(
        item: MilestoneTemplate,
        userData?: UserData
    ): Promise<MilestoneTemplate> {
        console.group('MilestoneTemplatesController.addItem()');
        try {
            // Ustaw _editor jeśli userData jest przekazany
            if (userData && !item._editor) {
                item._editor =
                    await PersonsController.getPersonFromSessionUserData(
                        userData
                    );
                item.editorId = item._editor.id;
            }

            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.addInDb(item, conn, true);
            });
            console.log('added in db');
            return item;
        } catch (err) {
            console.error('Error adding MilestoneTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== EDIT ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Aktualizuje istniejący MilestoneTemplate
     *
     * @param item - MilestoneTemplate do aktualizacji
     * @param auth - Opcjonalny OAuth2Client (obecnie nieużywany)
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneTemplate> - Zaktualizowany obiekt
     */
    static async edit(
        item: MilestoneTemplate,
        auth?: OAuth2Client,
        userData?: UserData
    ): Promise<MilestoneTemplate> {
        const instance = this.getInstance();
        return await instance.editItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Aktualizuje MilestoneTemplate w bazie danych
     *
     * @param item - MilestoneTemplate do aktualizacji
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneTemplate> - Zaktualizowany obiekt
     */
    private async editItem(
        item: MilestoneTemplate,
        userData?: UserData
    ): Promise<MilestoneTemplate> {
        console.group('MilestoneTemplatesController.editItem()');
        try {
            // Ustaw _editor jeśli userData jest przekazany
            if (userData && !item._editor) {
                item._editor =
                    await PersonsController.getPersonFromSessionUserData(
                        userData
                    );
                item.editorId = item._editor.id;
            }

            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.editInDb(item, conn, true);
            });
            console.log('edited in db');
            return item;
        } catch (err) {
            console.error('Error editing MilestoneTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa MilestoneTemplate z bazy danych
     *
     * @param item - MilestoneTemplate do usunięcia
     * @param auth - Opcjonalny OAuth2Client (obecnie nieużywany)
     * @returns Promise<void>
     */
    static async delete(
        item: MilestoneTemplate,
        auth?: OAuth2Client
    ): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteItem(item);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa MilestoneTemplate z bazy danych
     *
     * @param item - MilestoneTemplate do usunięcia
     * @returns Promise<void>
     */
    private async deleteItem(item: MilestoneTemplate): Promise<void> {
        console.group('MilestoneTemplatesController.deleteItem()');
        try {
            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.deleteFromDb(item, conn, true);
            });
            console.log('deleted from db');
        } catch (err) {
            console.error('Error deleting MilestoneTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}
