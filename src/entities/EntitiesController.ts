import Entity from './Entity';
import BaseController from '../controllers/BaseController';
import EntityRepository, { EntitiesSearchParams } from './EntityRepository';

export type { EntitiesSearchParams };

export default class EntitiesController extends BaseController<
    Entity,
    EntityRepository
> {
    private static instance: EntitiesController;

    constructor() {
        super(new EntityRepository());
    }

    private static getInstance(): EntitiesController {
        if (!this.instance) {
            this.instance = new EntitiesController();
        }
        return this.instance;
    }

    // ==================== READ (bez auth) ====================
    /**
     * Wyszukuje encje według parametrów
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<Entity[]> - Lista encji
     */
    static async find(
        searchParams: EntitiesSearchParams[] = []
    ): Promise<Entity[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    // ==================== CREATE ====================
    /**
     * API PUBLICZNE
     * Dodaje nową encję do systemu
     *
     * @param entityData - Dane encji do dodania
     * @returns Promise<Entity> - Dodana encja
     */
    static async add(entityData: {
        name: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        const instance = this.getInstance();
        return await instance.addEntity(entityData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje encję do DB
     *
     * @param entityData - Dane encji do dodania
     * @returns Promise<Entity> - Dodana encja
     */
    private async addEntity(entityData: {
        name: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        console.group('EntitiesController.addEntity()');
        try {
            const entity = new Entity(entityData);
            await this.create(entity);
            console.log(`Entity ${entity.name} added in db`);
            return entity;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== UPDATE ====================
    /**
     * API PUBLICZNE
     * Aktualizuje istniejącą encję
     *
     * @param entityData - Dane encji do aktualizacji
     * @returns Promise<Entity> - Zaktualizowana encja
     */
    static async edit(entityData: {
        id: number;
        name?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        const instance = this.getInstance();
        return await instance.editEntity(entityData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Edytuje encję w DB
     *
     * @param entityData - Dane encji do aktualizacji
     * @returns Promise<Entity> - Zaktualizowana encja
     */
    private async editEntity(entityData: {
        id: number;
        name?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        console.group('EntitiesController.editEntity()');
        try {
            const entity = new Entity(entityData);
            await this.repository.editInDb(entity, undefined, undefined, [
                'name',
                'address',
                'taxNumber',
                'www',
                'email',
                'phone',
            ]);
            console.log(`Entity ${entity.name} updated in db`);
            return entity;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================
    /**
     * API PUBLICZNE
     * Usuwa encję z systemu
     *
     * @param entityData - Dane encji do usunięcia
     * @returns Promise<void>
     */
    static async delete(entityData: Entity): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteEntity(entityData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa encję z DB
     *
     * @param entityData - Dane encji do usunięcia
     * @returns Promise<void>
     */
    private async deleteEntity(entityData: Entity): Promise<void> {
        console.group('EntitiesController.deleteEntity()');
        try {
            const entity = new Entity(entityData);
            await this.repository.deleteFromDb(entity);
            console.log(`Entity with id ${entity.id} deleted from db`);
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DEPRECATED (dla kompatybilności wstecznej) ====================
    /**
     * @deprecated Użyj EntitiesController.add(entityData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async addNewEntity(entityData: {
        name: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        return await this.add(entityData);
    }

    /**
     * @deprecated Użyj EntitiesController.edit(entityData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async updateEntity(entityData: {
        id: number;
        name?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        return await this.edit(entityData);
    }

    /**
     * @deprecated Użyj EntitiesController.delete(entityData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async deleteEntity(entityData: Entity): Promise<void> {
        return await this.delete(entityData);
    }
}
