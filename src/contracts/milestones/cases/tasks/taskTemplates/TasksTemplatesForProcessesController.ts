import BaseController from '../../../../../controllers/BaseController';
import ToolsDb from '../../../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import TaskTemplateForProcess from './TaskTemplateForProcess';
import TaskTemplateForProcessRepository, {
    TaskTemplatesForProcessesSearchParams,
} from './TaskTemplateForProcessRepository';
import PersonsController from '../../../../../persons/PersonsController';
import { UserData } from '../../../../../types/sessionTypes';

/**
 * Controller dla TaskTemplateForProcess - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model, transakcje)
 * - Zarządza transakcjami bazodanowymi
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 */
export default class TasksTemplatesForProcessesController extends BaseController<
    TaskTemplateForProcess,
    TaskTemplateForProcessRepository
> {
    private static instance: TasksTemplatesForProcessesController;

    constructor() {
        super(new TaskTemplateForProcessRepository());
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): TasksTemplatesForProcessesController {
        if (!this.instance) {
            this.instance = new TasksTemplatesForProcessesController();
        }
        return this.instance;
    }

    // ==================== READ ====================
    /**
     * Wyszukuje szablony zadań dla procesów
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<TaskTemplateForProcess[]>
     */
    static async find(
        searchParams: TaskTemplatesForProcessesSearchParams = {}
    ): Promise<TaskTemplateForProcess[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    // ==================== ADD ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowy TaskTemplateForProcess do bazy danych
     *
     * @param item - TaskTemplateForProcess do dodania
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<TaskTemplateForProcess> - Dodany obiekt
     */
    static async add(
        item: TaskTemplateForProcess,
        userData?: UserData
    ): Promise<TaskTemplateForProcess> {
        const instance = this.getInstance();
        return await instance.addItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje TaskTemplateForProcess do bazy danych
     */
    private async addItem(
        item: TaskTemplateForProcess,
        userData?: UserData
    ): Promise<TaskTemplateForProcess> {
        console.group('TasksTemplatesForProcessesController.addItem()');
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
            console.error('Error adding TaskTemplateForProcess:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== EDIT ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Aktualizuje istniejący TaskTemplateForProcess
     *
     * @param item - TaskTemplateForProcess do aktualizacji
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<TaskTemplateForProcess> - Zaktualizowany obiekt
     */
    static async edit(
        item: TaskTemplateForProcess,
        userData?: UserData
    ): Promise<TaskTemplateForProcess> {
        const instance = this.getInstance();
        return await instance.editItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Aktualizuje TaskTemplateForProcess w bazie danych
     */
    private async editItem(
        item: TaskTemplateForProcess,
        userData?: UserData
    ): Promise<TaskTemplateForProcess> {
        console.group('TasksTemplatesForProcessesController.editItem()');
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
            console.error('Error editing TaskTemplateForProcess:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa TaskTemplateForProcess z bazy danych
     *
     * @param item - TaskTemplateForProcess do usunięcia
     * @returns Promise<void>
     */
    static async delete(item: TaskTemplateForProcess): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteItem(item);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa TaskTemplateForProcess z bazy danych
     */
    private async deleteItem(item: TaskTemplateForProcess): Promise<void> {
        console.group('TasksTemplatesForProcessesController.deleteItem()');
        try {
            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.deleteFromDb(item, conn, true);
            });
            console.log('deleted from db');
        } catch (err) {
            console.error('Error deleting TaskTemplateForProcess:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}
