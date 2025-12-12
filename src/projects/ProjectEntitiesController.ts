import mysql from 'mysql2/promise';
import BaseController from '../controllers/BaseController';
import ProjectEntity from './ProjectEntity';
import ProjectEntityRepository, {
    ProjectEntitySearchParams,
} from './ProjectEntityRepository';

export default class ProjectEntitiesController extends BaseController<
    ProjectEntity,
    ProjectEntityRepository
> {
    private static instance: ProjectEntitiesController;

    constructor() {
        super(new ProjectEntityRepository());
    }

    private static getInstance(): ProjectEntitiesController {
        if (!this.instance) {
            this.instance = new ProjectEntitiesController();
        }
        return this.instance;
    }

    static async add(
        association: ProjectEntity,
        conn: mysql.PoolConnection,
        isPartOfTransaction: boolean = true
    ): Promise<ProjectEntity> {
        const instance = this.getInstance();
        await instance.repository.addInDb(
            association,
            conn,
            isPartOfTransaction
        );
        return association;
    }

    static async deleteByProjectId(
        projectId: number,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteByProjectId(projectId, conn);
    }

    static async find(
        conditions: ProjectEntitySearchParams = {}
    ): Promise<ProjectEntity[]> {
        const instance = this.getInstance();
        return await instance.repository.find(conditions);
    }
}
