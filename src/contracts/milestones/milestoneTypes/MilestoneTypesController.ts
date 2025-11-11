import BaseController from '../../../controllers/BaseController';
import MilestoneTypeRepository, {
    MilestoneTypesSearchParams,
} from './MilestoneTypeRepository';
import MilestoneType from './MilestoneType';
import { OAuth2Client } from 'google-auth-library';
import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import PersonsController from '../../../persons/PersonsController';
import { UserData } from '../../../types/sessionTypes';

/**
 * Controller dla MilestoneType - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model, transakcje)
 * - Zarządza transakcjami bazodanowymi
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 */
export default class MilestoneTypesController extends BaseController<
    MilestoneType,
    MilestoneTypeRepository
> {
    private static instance: MilestoneTypesController;

    constructor() {
        super(new MilestoneTypeRepository());
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): MilestoneTypesController {
        if (!this.instance) {
            this.instance = new MilestoneTypesController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę MilestoneTypes według podanych warunków
     *
     * REFAKTORING: Deleguje do MilestoneTypeRepository.find()
     * Controller tylko orkiestruje - Repository obsługuje SQL i mapowanie
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<MilestoneType[]> - Lista znalezionych MilestoneTypes
     */
    static async find(
        orConditions: MilestoneTypesSearchParams[] = []
    ): Promise<MilestoneType[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Dodaje nowy MilestoneType do bazy danych
     *
     * UWAGA: MilestoneType NIE ma operacji GD, więc NIE wymaga OAuth
     * Metoda przygotowana do przyszłego rozszerzenia (auth jako opcjonalny parametr)
     *
     * @param item - MilestoneType do dodania
     * @param auth - Opcjonalny OAuth2Client (obecnie nieużywany)
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneType> - Dodany obiekt
     */
    static async add(
        item: MilestoneType,
        auth?: OAuth2Client,
        userData?: UserData
    ): Promise<MilestoneType> {
        const instance = this.getInstance();
        return await instance.addItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje MilestoneType do bazy danych
     *
     * @param item - MilestoneType do dodania
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneType> - Dodany obiekt
     */
    private async addItem(
        item: MilestoneType,
        userData?: UserData
    ): Promise<MilestoneType> {
        console.group('MilestoneTypesController.addItem()');
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
            console.error('Error adding MilestoneType:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Aktualizuje istniejący MilestoneType
     *
     * @param item - MilestoneType do aktualizacji
     * @param auth - Opcjonalny OAuth2Client (obecnie nieużywany)
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneType> - Zaktualizowany obiekt
     */
    static async edit(
        item: MilestoneType,
        auth?: OAuth2Client,
        userData?: UserData
    ): Promise<MilestoneType> {
        const instance = this.getInstance();
        return await instance.editItem(item, userData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Aktualizuje MilestoneType w bazie danych
     *
     * @param item - MilestoneType do aktualizacji
     * @param userData - Dane użytkownika z sesji (do ustawienia _editor)
     * @returns Promise<MilestoneType> - Zaktualizowany obiekt
     */
    private async editItem(
        item: MilestoneType,
        userData?: UserData
    ): Promise<MilestoneType> {
        console.group('MilestoneTypesController.editItem()');
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
            console.error('Error editing MilestoneType:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE (dla Routera i innych klas)
     * Usuwa MilestoneType z bazy danych
     *
     * @param item - MilestoneType do usunięcia
     * @param auth - Opcjonalny OAuth2Client (obecnie nieużywany)
     * @returns Promise<void>
     */
    static async delete(
        item: MilestoneType,
        auth?: OAuth2Client
    ): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteItem(item);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa MilestoneType z bazy danych
     *
     * @param item - MilestoneType do usunięcia
     * @returns Promise<void>
     */
    private async deleteItem(item: MilestoneType): Promise<void> {
        console.group('MilestoneTypesController.deleteItem()');
        try {
            // Transakcja DB
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.deleteFromDb(item, conn, true);
            });
            console.log('deleted from db');
        } catch (err) {
            console.error('Error deleting MilestoneType:', err);
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}
