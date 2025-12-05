import BaseController from '../../../../../controllers/BaseController';
import ToolsDb from '../../../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import TaskTemplate from './TaskTemplate';
import TaskTemplateRepository, {
    TaskTemplatesSearchParams,
} from './TaskTemplateRepository';
import PersonsController from '../../../../../persons/PersonsController';
import { UserData } from '../../../../../types/sessionTypes';

/**
 * Controller dla TaskTemplate - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model, transakcje)
 * - Zarządza transakcjami bazodanowymi
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 */
export default class TaskTemplatesController extends BaseController<
    TaskTemplate,
    TaskTemplateRepository
> {
    private static instance: TaskTemplatesController;

    constructor() {
        super(new TaskTemplateRepository());
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): TaskTemplatesController {
        if (!this.instance) {
            this.instance = new TaskTemplatesController();
        }
        return this.instance;
    }

    // ==================== READ ====================

    /**
     * @deprecated Użyj find() zamiast getTaskTemplatesList()
     */
    static async getTaskTemplatesList(
        initParamObject: TaskTemplatesSearchParams
    ): Promise<TaskTemplate[]> {
        return this.find(initParamObject);
    }

    /**
     * Wyszukuje szablony zadań
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<TaskTemplate[]>
     */
    static async find(
        searchParams: TaskTemplatesSearchParams = {}
    ): Promise<TaskTemplate[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    // ==================== ADD ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowy TaskTemplate do bazy danych
     *
     * @param item - TaskTemplate do dodania
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<TaskTemplate> - Dodany obiekt
     */
    static async add(
        item: TaskTemplate,
        userData?: UserData
    ): Promise<TaskTemplate> {
        const instance = this.getInstance();
        return await instance.addItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje TaskTemplate do bazy danych
     */
    private async addItem(
        item: TaskTemplate,
        userData?: UserData
    ): Promise<TaskTemplate> {
        console.group('TaskTemplatesController.addItem()');
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
            console.error('Error adding TaskTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== EDIT ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Aktualizuje istniejący TaskTemplate
     *
     * @param item - TaskTemplate do aktualizacji
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<TaskTemplate> - Zaktualizowany obiekt
     */
    static async edit(
        item: TaskTemplate,
        userData?: UserData
    ): Promise<TaskTemplate> {
        const instance = this.getInstance();
        return await instance.editItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Aktualizuje TaskTemplate w bazie danych
     */
    private async editItem(
        item: TaskTemplate,
        userData?: UserData
    ): Promise<TaskTemplate> {
        console.group('TaskTemplatesController.editItem()');
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
            console.error('Error editing TaskTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa TaskTemplate z bazy danych
     *
     * @param item - TaskTemplate do usunięcia
     * @returns Promise<void>
     */
    static async delete(item: TaskTemplate): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteItem(item);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa TaskTemplate z bazy danych
     */
    private async deleteItem(item: TaskTemplate): Promise<void> {
        console.group('TaskTemplatesController.deleteItem()');
        try {
            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.deleteFromDb(item, conn, true);
            });
            console.log('deleted from db');
        } catch (err) {
            console.error('Error deleting TaskTemplate:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}
