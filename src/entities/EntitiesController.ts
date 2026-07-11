import mysql from 'mysql2/promise';
import Entity from './Entity';
import BaseController from '../controllers/BaseController';
import EntityRepository, { EntitiesSearchParams } from './EntityRepository';
import ToolsDb from '../tools/ToolsDb';
import {
    enqueueFidmanEntityPush,
    entityHasSyncedContract,
    tryDeliverAfterCommit as tryDeliverFidmanAfterCommit,
} from '../contracts/fidmanSync/FidmanSync';
import { isValidNipChecksum } from '../contracts/aqmSync/AqmSync';

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
        shortName?: string;
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
        shortName?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        console.group('EntitiesController.addEntity()');
        try {
            const entity = new Entity(entityData);
            // SYNC-P3: no NIP guard here — a brand-new entity has no id yet, so it
            // cannot already be a party of a contract (associations only reference
            // existing entity ids, see ContractEntityController.addAssociations).
            // entityHasSyncedContract() would always be false at this point; the
            // guard only has bite on editEntity below.
            if (entity.shortName) {
                const duplicate = await this.repository.find([
                    { shortName: entity.shortName },
                ]);
                if (duplicate.length > 0)
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
            }
            try {
                await this.create(entity);
            } catch (err: any) {
                if (err.code === 'ER_DUP_ENTRY')
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
                throw err;
            }
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
        shortName?: string;
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
        shortName?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        console.group('EntitiesController.editEntity()');
        try {
            const entity = new Entity(entityData);
            if (entity.shortName) {
                const duplicate = await this.repository.find([
                    { shortName: entity.shortName },
                ]);
                if (duplicate.length > 0 && duplicate[0].id !== entity.id)
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
            }
            // SYNC-P1: wpis do FidmanSyncOutbox w TEJ SAMEJ transakcji co edycja
            // encji (L8), tylko gdy encja jest stroną ≥1 umowy typu FIDman.
            let fidmanOutboxId: number | undefined;
            try {
                await ToolsDb.transaction(
                    async (conn: mysql.PoolConnection) => {
                        const isSyncParty = await entityHasSyncedContract(
                            entity.id,
                            conn
                        );
                        // SYNC-P3: entities that are already a party of a synced-type
                        // contract must carry a NIP that passes format+checksum — it
                        // is FIDman's dedup/link key (legacy_id -> normalized NIP).
                        // Non-sync-party entities are untouched: no format requirement,
                        // so editing foreign/legacy counterparts that never sync keeps
                        // working exactly as before.
                        if (isSyncParty && !isValidNipChecksum(entity.taxNumber)) {
                            throw new Error(
                                `Podmiot "${entity.name ?? entity.id}" jest stroną zsynchronizowanej z FIDman umowy — wymagany prawidłowy NIP (10 cyfr, poprawna suma kontrolna).`
                            );
                        }
                        await this.repository.editInDb(entity, conn, true, [
                            'name',
                            'shortName',
                            'address',
                            'taxNumber',
                            'www',
                            'email',
                            'phone',
                        ]);
                        if (isSyncParty) {
                            fidmanOutboxId = await enqueueFidmanEntityPush(
                                entity,
                                conn
                            );
                        }
                    }
                );
            } catch (err: any) {
                if (err.code === 'ER_DUP_ENTRY')
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
                throw err;
            }
            console.log(`Entity ${entity.name} updated in db`);

            // SYNC-P1: push STRICTLY post-commit; awaria nigdy nie rolbackuje
            // ani nie wychodzi z edycji encji (L8).
            if (fidmanOutboxId !== undefined) {
                await tryDeliverFidmanAfterCommit(fidmanOutboxId).catch((err) =>
                    console.error(
                        '[FidmanSync] post-commit push (entity edit) error:',
                        err
                    )
                );
            }
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
