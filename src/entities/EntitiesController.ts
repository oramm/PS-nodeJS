import Entity from './Entity';
import BaseController
 from '../controllers/BaseController';
import EntityRepository, {
    EntitiesSearchParams,
} from './EntityRepository';

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

    static async addNewEntity(entityData: {
        name: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }) : Promise<Entity> {
        const instance = this.getInstance();
        const entity = new Entity(entityData);
        await instance.create(entity);
        console.log(`Entity ${entity.name} added in db`);
        return entity;
    }

    static async find(
        searchParams: EntitiesSearchParams[] = []
    ): Promise<Entity[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    static async updateEntity(entityData: {
        id: number;
        name?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        const instance = this.getInstance();
        const entity = new Entity(entityData);
        await instance.edit(entity, undefined, undefined, ['name', 'address', 'taxNumber', 'www', 'email', 'phone']);
        console.log(`Entity ${entity.name} updated in db`);
        return entity;
    }

    static async deleteEntity(
        entityData: Entity
    ): Promise<void> {
        const instance = this.getInstance();
        const entity = new Entity(entityData);
        await instance.delete(entity);
        console.log(`Entity with id ${entity.id} deleted from db`);
    }
}
