import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Project from './Project';
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import { UserData } from '../types/sessionTypes';
import Setup from '../setup/Setup';
import BaseController from '../controllers/BaseController';
import ProjectRepository, { ProjectSearchParams } from './ProjectRepository';
import { OAuth2Client } from 'google-auth-library';

export default class ProjectsController extends BaseController<
    Project,
    ProjectRepository
> {
    private static instance: ProjectsController;

    constructor() {
        super(new ProjectRepository());
    }

    // Singleton pattern
    private static getInstance(): ProjectsController {
        if (!this.instance) {
            this.instance = new ProjectsController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę projektów według podanych warunków
     *
     * REFAKTORING: Deleguje do ProjectRepository.find()
     * Controller tylko orkiestruje - Repository obsługuje SQL i mapowanie
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<Project[]> - Lista znalezionych Projects
     */
    static async find(
        orConditions: ProjectSearchParams[] = []
    ): Promise<Project[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * API PUBLICZNE - Dodaje nowy Project
     *
     * @param project - Project do dodania
     * @param auth - OAuth2Client dla operacji GD
     * @returns Dodany Project
     */
    static async add(project: Project, auth?: OAuth2Client): Promise<Project> {
        return await this.withAuth<Project>(
            async (instance: ProjectsController, authClient: OAuth2Client) => {
                return await instance.addProject(authClient, project);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Dodaje Project z asocjacjami
     *
     * Przepływ:
     * 1. Model: createProjectFolder(auth) - tworzy folder GD
     * 2. Controller: transakcja DB
     *    - Repository: addInDb() - dodaje główny rekord
     *    - addProjectEntitiesAssociations() - dodaje asocjacje
     * 3. Rollback folderu GD przy błędzie DB
     */
    private async addProject(
        auth: OAuth2Client,
        project: Project
    ): Promise<Project> {
        console.group('ProjectsController.addProject()');

        try {
            // 1. Utwórz folder w Google Drive
            await project.createProjectFolder(auth);
            console.log('GD folder created');

            // 2. Pobierz asocjacje z klienta (już są w project._employers i project._engineers)
            await project.setProjectEntityAssociationsFromDb();

            try {
                // 3. Transakcja DB
                await ToolsDb.transaction(
                    async (conn: mysql.PoolConnection) => {
                        // 3a. Dodaj główny rekord Project
                        await this.repository.addInDb(project, conn, true);

                        // 3b. Dodaj asocjacje Project-Entity
                        await this.addProjectEntitiesAssociations(
                            project,
                            conn
                        );
                    }
                );

                console.log('Project added to DB');
                return project;
            } catch (dbError) {
                // Rollback: usuń folder GD jeśli DB się nie powiodło
                console.error('DB transaction failed, rolling back GD folder');
                await project.deleteProjectFolder(auth);
                throw dbError;
            }
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE - Edytuje Project
     *
     * @param project - Project do edycji
     * @param auth - OAuth2Client dla operacji GD
     * @returns Zaktualizowany Project
     */
    static async edit(project: Project, auth?: OAuth2Client): Promise<Project> {
        return await this.withAuth<Project>(
            async (instance: ProjectsController, authClient: OAuth2Client) => {
                return await instance.editProject(authClient, project);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Edytuje Project z asocjacjami
     *
     * Przepływ:
     * 1. Controller: transakcja DB
     *    - Repository: editInDb() - edytuje główny rekord
     *    - editProjectEntitiesAssociations() - aktualizuje asocjacje
     * 2. Model: editProjectFolder(auth) - równolegle aktualizuje GD
     */
    private async editProject(
        auth: OAuth2Client,
        project: Project
    ): Promise<Project> {
        console.group('ProjectsController.editProject()');

        try {
            // Równolegle: DB i GD
            await Promise.all([
                // 1. Transakcja DB
                ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                    // 1a. Edytuj główny rekord
                    await this.repository.editInDb(project, conn, true);

                    // 1b. Edytuj asocjacje (delete + insert)
                    await this.editProjectEntitiesAssociations(project, conn);
                }),

                // 2. Edytuj folder GD
                project.editProjectFolder(auth),
            ]);

            console.log('Project edited');
            return project;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE - Usuwa Project
     *
     * @param project - Project do usunięcia
     * @param auth - OAuth2Client dla operacji GD
     */
    static async delete(project: Project, auth?: OAuth2Client): Promise<void> {
        return await this.withAuth<void>(
            async (instance: ProjectsController, authClient: OAuth2Client) => {
                return await instance.deleteProject(authClient, project);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Usuwa Project
     *
     * Przepływ:
     * 1. Controller: deleteFromDb() - usuwa z DB (CASCADE dla asocjacji)
     * 2. Model: deleteProjectFolder(auth) - usuwa folder GD
     */
    private async deleteProject(
        auth: OAuth2Client,
        project: Project
    ): Promise<void> {
        console.group('ProjectsController.deleteProject()');

        try {
            // 1. Usuń z bazy (CASCADE usunie też Projects_Entities)
            await this.repository.deleteFromDb(project);
            console.log('Project deleted from DB');

            // 2. Usuń folder GD
            await project.deleteProjectFolder(auth);
            console.log(`Project: ${project.ourId} ${project.alias} deleted`);
        } finally {
            console.groupEnd();
        }
    }

    /**
     * PRIVATE HELPER - Dodaje asocjacje Project-Entity
     */
    private async addProjectEntitiesAssociations(
        project: Project,
        conn: mysql.PoolConnection
    ): Promise<void> {
        // Dodaj EMPLOYERS
        if (project._employers) {
            for (const entity of project._employers) {
                const association = new ProjectEntity({
                    _project: project,
                    _entity: entity,
                    projectRole: 'EMPLOYER',
                });
                await association.addInDb(conn, true);
            }
        }

        // Dodaj ENGINEERS
        if (project._engineers) {
            for (const entity of project._engineers) {
                const association = new ProjectEntity({
                    _project: project,
                    _entity: entity,
                    projectRole: 'ENGINEER',
                });
                await association.addInDb(conn, true);
            }
        }
    }

    /**
     * PRIVATE HELPER - Edytuje asocjacje Project-Entity (delete + insert)
     */
    private async editProjectEntitiesAssociations(
        project: Project,
        conn: mysql.PoolConnection
    ): Promise<void> {
        // 1. Usuń stare asocjacje
        await this.deleteProjectEntityAssociations(project, conn);

        // 2. Dodaj nowe asocjacje
        await this.addProjectEntitiesAssociations(project, conn);
    }

    /**
     * PRIVATE HELPER - Usuwa asocjacje Project-Entity
     */
    private async deleteProjectEntityAssociations(
        project: Project,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const sql = `DELETE FROM Projects_Entities WHERE ProjectId = ?`;
        await ToolsDb.executePreparedStmt(sql, [project.id], project, conn);
    }
}
