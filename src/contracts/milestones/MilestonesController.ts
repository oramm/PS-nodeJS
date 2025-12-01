import BaseController from '../../controllers/BaseController';
import Milestone from './Milestone';
import MilestoneRepository, {
    MilestonesSearchParams,
} from './MilestoneRepository';
import { MilestoneParentType } from '../../types/types';
import { OAuth2Client } from 'google-auth-library';
import { UserData } from '../../types/sessionTypes';
import ToolsDb from '../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import CaseTypeRepository from './cases/caseTypes/CaseTypeRepository';
import ToolsGd from '../../tools/ToolsGd';
import Case from './cases/Case';
import CaseTemplateRepository from './cases/caseTemplates/CaseTemplateRepository';
import CaseRepository from './cases/CaseRepository';
import CasesController from './cases/CasesController';
import ProcessInstance from '../../processes/processInstances/ProcessInstance';
import Task from './cases/tasks/Task';

/**
 * Controller dla Milestone - warstwa orkiestracji
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseController<Milestone, MilestoneRepository>
 * - Orkiestruje operacje biznesowe
 * - Deleguje do Repository dla operacji DB
 */
export default class MilestonesController extends BaseController<
    Milestone,
    MilestoneRepository
> {
    private static instance: MilestonesController;

    constructor() {
        super(new MilestoneRepository());
    }

    // Singleton pattern
    private static getInstance(): MilestonesController {
        if (!this.instance) {
            this.instance = new MilestonesController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę Milestones według podanych warunków
     *
     * REFAKTORING: Deleguje do MilestoneRepository.find()
     * Controller tylko orkiestruje - Repository obsługuje SQL i mapowanie
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @param parentType - Typ rodzica: 'CONTRACT' lub 'OFFER'
     * @returns Promise<Milestone[]> - Lista znalezionych Milestones
     */
    static async find(
        orConditions: MilestonesSearchParams[] = [],
        parentType: MilestoneParentType = 'CONTRACT'
    ): Promise<Milestone[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions, parentType);
    }

    /**
     * @deprecated Użyj MilestonesController.find() zamiast tego.
     *
     * REFAKTORING: Logika przeniesiona do find() + MilestoneRepository
     *
     * Migracja:
     * ```typescript
     * // STARE:
     * await MilestonesController.getMilestonesList(orConditions, parentType);
     *
     * // NOWE:
     * await MilestonesController.find(orConditions, parentType);
     * ```
     */
    static async getMilestonesList(
        orConditions: MilestonesSearchParams[] = [],
        parentType: MilestoneParentType = 'CONTRACT'
    ): Promise<Milestone[]> {
        return await this.find(orConditions, parentType);
    }

    /**
     * API PUBLICZNE - Dodaje wiele Milestones z datami w transakcji (bulk insert)
     * Używane przy tworzeniu Contract/Offer z domyślnymi Milestones
     *
     * @param milestones - Tablica Milestones do dodania
     * @param externalConn - Opcjonalne zewnętrzne połączenie (dla większej transakcji)
     * @returns Promise<Milestone[]> - Dodane Milestones
     */
    static async addBulkWithDates(
        milestones: Milestone[],
        externalConn?: mysql.PoolConnection
    ): Promise<Milestone[]> {
        const instance = this.getInstance();
        return await instance.repository.addMilestonesWithDates(
            milestones,
            externalConn
        );
    }

    /**
     * API PUBLICZNE - Dodaje nowy Milestone
     *
     * @param milestone - Milestone do dodania
     * @param auth - OAuth2Client dla operacji GD
     * @param userData - Dane użytkownika z sesji
     * @returns Dodany Milestone
     */
    static async add(
        milestone: Milestone,
        auth?: OAuth2Client,
        userData?: UserData
    ): Promise<Milestone> {
        return await this.withAuth<Milestone>(
            async (
                instance: MilestonesController,
                authClient: OAuth2Client
            ) => {
                return await instance.addMilestone(
                    authClient,
                    milestone,
                    userData
                );
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Dodaje Milestone z folderami i default cases
     *
     * Przepływ:
     * 1. Model: createFolders(auth) - tworzy folder GD + podfoldery dla case types
     * 2. Controller: transakcja DB
     *    - Repository: addInDb() - dodaje główny rekord
     *    - Model: addDatesInDb() - dodaje powiązane daty
     * 3. Model: createDefaultCases(auth) - tworzy domyślne sprawy
     * 4. Model: editFolder(auth) - aktualizuje folder (nazwa z numerem)
     * 5. Rollback folderu GD i DB przy błędzie
     */
    private async addMilestone(
        auth: OAuth2Client,
        milestone: Milestone,
        userData?: UserData
    ): Promise<Milestone> {
        if (!milestone._dates.length) {
            throw new Error('Milestone dates are not defined');
        }

        console.group(
            'Adding Milestone',
            milestone._FolderNumber_TypeName_Name
        );

        try {
            if (!milestone._contract && !milestone._offer) {
                throw new Error(
                    'Contract or offer is not defined for Milestone'
                );
            }

            if (!milestone.typeId) {
                throw new Error('Milestone type is not defined');
            }

            // 1. Utwórz foldery w Google Drive
            await MilestonesController.createFolders(milestone, auth);
            console.log('GD folders created');

            try {
                // 2. Transakcja DB - Milestone + Dates (pojedynczy insert)
                await this.repository.addMilestonesWithDates([milestone]);

                console.log('Milestone added to DB');

                // 3. Utwórz domyślne sprawy (Cases)
                await MilestonesController.createDefaultCases(milestone, auth, {
                    isPartOfBatch: false,
                });
                console.log('Default cases created');

                // 4. Edytuj folder (zaktualizuj nazwę z numerem)
                await this.editMilestoneFolder(auth, milestone);
                console.log('Folder name updated');

                return milestone;
            } catch (dbError) {
                // Rollback: usuń folder GD i DB jeśli coś się nie powiodło
                console.error('DB transaction failed, rolling back');
                await milestone.deleteFolder(auth).catch((error) => {
                    console.error('Error deleting folder:', error);
                });
                await milestone.deleteFromDb().catch((error) => {
                    console.error('Error deleting from DB:', error);
                });
                throw dbError;
            }
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE - Edytuje Milestone
     *
     * @param milestone - Milestone do edycji
     * @param auth - OAuth2Client dla operacji GD
     * @param userData - Dane użytkownika z sesji
     * @param fieldsToUpdate - Opcjonalna lista pól do aktualizacji
     * @returns Zaktualizowany Milestone
     */
    static async edit(
        milestone: Milestone,
        auth?: OAuth2Client,
        userData?: UserData,
        fieldsToUpdate?: string[]
    ): Promise<Milestone> {
        return await this.withAuth<Milestone>(
            async (
                instance: MilestonesController,
                authClient: OAuth2Client
            ) => {
                return await instance.editMilestone(
                    authClient,
                    milestone,
                    userData,
                    fieldsToUpdate
                );
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Edytuje Milestone
     *
     * Przepływ:
     * 1. Walidacja (typeId, gdFolderId)
     * 2. Transakcja DB - Milestone + Dates (jeśli potrzebne)
     * 3. Równolegle (jeśli nie tylko DB fields):
     *    - editFolder(auth) - aktualizuje folder GD
     *    - editInScrum(auth) - aktualizuje Scrum
     */
    private async editMilestone(
        auth: OAuth2Client,
        milestone: Milestone,
        userData?: UserData,
        fieldsToUpdate?: string[]
    ): Promise<Milestone> {
        console.group(
            'Editing Milestone',
            milestone._FolderNumber_TypeName_Name
        );

        try {
            if (!milestone.typeId) {
                throw new Error('Milestone type is not defined');
            }
            if (!milestone.gdFolderId) {
                throw new Error('Milestone folder is not defined');
            }

            // Sprawdź czy edycja dotyczy tylko pól DB (bez GD/Scrum)
            const onlyDbFields = ['status', 'description', 'number', 'name'];
            const isOnlyDbFields =
                fieldsToUpdate &&
                fieldsToUpdate.length > 0 &&
                fieldsToUpdate.every((field) => onlyDbFields.includes(field));

            // 1. Transakcja DB - Milestone + Dates
            await this.repository.editMilestoneWithDates(
                milestone,
                undefined,
                false,
                fieldsToUpdate
            );

            console.log('Milestone edited in DB');

            // 2. Równolegle: GD + Scrum (jeśli nie tylko DB fields)
            if (!isOnlyDbFields) {
                await Promise.all([
                    this.editMilestoneFolder(auth, milestone),
                    milestone.editInScrum(auth),
                ]);
                console.log('Milestone folder edited in GD');
                console.log('Milestone edited in Scrum');
            }

            return milestone;
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE - Aktualizuje folder Milestone w Google Drive
     * Jeśli folder nie istnieje, tworzy go wraz z podfolderami.
     *
     * REFAKTORING: Logika przeniesiona z Milestone.editFolder() (Clean Architecture)
     * Model nie powinien wywoływać Controller.
     *
     * @param milestone - Milestone z danymi folderu
     * @param auth - OAuth2Client dla operacji GD
     * @returns Promise<void>
     */
    static async editFolder(
        milestone: Milestone,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: MilestonesController,
                authClient: OAuth2Client
            ) => {
                return await instance.editMilestoneFolder(
                    authClient,
                    milestone
                );
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Aktualizuje lub tworzy folder Milestone
     *
     * Przepływ:
     * 1. Próbuj zaktualizować nazwę folderu (Model.updateFolderName)
     * 2. Jeśli folder nie istnieje → utwórz foldery (createFolders)
     */
    private async editMilestoneFolder(
        auth: OAuth2Client,
        milestone: Milestone
    ): Promise<void> {
        console.group('MilestonesController.editMilestoneFolder()');
        try {
            // Próbuj zaktualizować folder
            const updated = await milestone.updateFolderName(auth);

            if (updated) {
                console.log('Milestone folder updated');
            } else {
                // Folder nie istnieje - utwórz go
                console.log('Folder does not exist, creating...');
                await MilestonesController.createFolders(milestone, auth);
                console.log('Milestone folder created');
            }
        } finally {
            console.groupEnd();
        }
    }

    /**
     * API PUBLICZNE - Usuwa Milestone
     *
     * @param milestone - Milestone do usunięcia
     * @param auth - OAuth2Client dla operacji GD
     */
    static async delete(
        milestone: Milestone,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: MilestonesController,
                authClient: OAuth2Client
            ) => {
                return await instance.deleteMilestone(authClient, milestone);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA - Usuwa Milestone
     *
     * Przepływ:
     * 1. Controller: deleteFromDb() - usuwa z DB (CASCADE dla MilestoneDates, Cases)
     * 2. Równolegle:
     *    - deleteFolder(auth) - usuwa folder GD
     *    - deleteFromScrum(auth) - usuwa z Scrum
     *
     * UWAGA: Operacje GD/Scrum są wykonywane po DB i nie wpływają na rollback DB.
     * Jeśli usuniecie z DB się powiedzie, ale GD/Scrum się nie uda, Milestone
     * zostaje usunięty z DB, ale folder/scrum mogą pozostać (do ręcznego usunięcia).
     */
    private async deleteMilestone(
        auth: OAuth2Client,
        milestone: Milestone
    ): Promise<void> {
        console.group('Deleting Milestone', milestone.id);

        try {
            // 1. Usuń z bazy (CASCADE usunie też MilestoneDates i powiązane Cases)
            await this.repository.deleteFromDb(milestone);
            console.log('Milestone deleted from DB');

            // 2. Równolegle: GD + Scrum (błędy nie wpływają na DB)
            try {
                await Promise.all([
                    milestone.deleteFolder(auth),
                    milestone.deleteFromScrum(auth),
                ]);
                console.log('Milestone deleted from GD and Scrum');
            } catch (gdScrumError) {
                // Loguj błąd, ale nie rollbackuj DB (już usunięte)
                console.error(
                    'Error deleting from GD/Scrum (DB already deleted):',
                    gdScrumError
                );
                // Możesz dodać powiadomienie do użytkownika o konieczności ręcznego usunięcia
            }
        } finally {
            console.groupEnd();
        }
    }

    /**
     * Tworzy foldery dla kamienia milowego i jego typów spraw
     * Orkiestracja: Model (dane) -> Repository (typy spraw) -> ToolsGd (Google Drive)
     */
    static async createFolders(milestone: Milestone, auth: OAuth2Client) {
        const parentGdId =
            milestone._contract?.gdFolderId || milestone._offer?.gdFolderId;
        if (!parentGdId)
            throw new Error('Contract or Offer folder id is not defined');

        // 1. Ustaw numer (jeśli nieunikalny)
        if (!milestone._type.isUniquePerContract) {
            // Jeśli to oferta, contractId może nie być ustawione, ale wtedy isUniquePerContract powinno być true?
            // W starej logice: WHERE TypeId = ? AND ContractId = ?
            // Jeśli to oferta, to ContractId jest undefined.
            // Sprawdźmy starą logikę setNumber:
            // if (!this._type.isUniquePerContract) { ... WHERE ... ContractId = ? ... }
            // Jeśli to oferta, to ContractId jest null/undefined. Zapytanie zwróci 0.
            // Czy kamienie w ofertach mogą być nieunikalne?
            // Zakładamy, że jeśli contractId istnieje, to używamy go.

            if (milestone.contractId) {
                const repo = new MilestoneRepository();
                milestone.number = await repo.getNextNumber(
                    milestone.typeId!,
                    milestone.contractId
                );
            }
        }

        // 2. Ustaw nazwę folderu (logika w modelu)
        milestone.setFolderName();

        // 3. Utwórz folder główny kamienia (Google Drive)
        const folder = await ToolsGd.setFolder(auth, {
            parentId: parentGdId,
            name: <string>milestone._folderName,
        });
        milestone.setGdFolderIdAndUrl(folder.id as string);

        // 4. Pobierz typy spraw (Repository)
        const caseTypeRepo = new CaseTypeRepository();
        const contractTypeId = milestone._contract?._type.id;

        if (!milestone._type.id)
            throw new Error('Milestone type id is missing');

        const caseTypes = await caseTypeRepo.findByMilestoneType(
            milestone._type.id,
            contractTypeId
        );

        // 5. Utwórz podfoldery dla typów spraw (Google Drive)
        const promises = [];
        for (const caseType of caseTypes) {
            promises.push(
                ToolsGd.setFolder(auth, {
                    parentId: <string>folder.id,
                    name: caseType._folderName,
                })
            );
        }
        await Promise.all(promises);
        return folder;
    }

    /**
     * Tworzy domyślne sprawy dla kamienia milowego
     * Orkiestracja: Repository (szablony) -> Model (tworzenie spraw) -> Repository (zapis)
     */
    static async createDefaultCases(
        milestone: Milestone,
        auth: OAuth2Client,
        parameters?: { isPartOfBatch: boolean }
    ) {
        const defaultCaseItems: Case[] = [];
        const caseTemplateRepo = new CaseTemplateRepository();

        if (!milestone._type.id)
            throw new Error('Milestone type id is not defined');

        // 1. Pobierz szablony spraw (Repository)
        const defaultCaseTemplates = await caseTemplateRepo.findByMilestoneType(
            milestone._type.id,
            {
                isDefaultOnly: true,
            }
        );

        console.log(milestone._contract?._type);

        // 2. Utwórz obiekty spraw (Model)
        for (const template of defaultCaseTemplates) {
            const caseItem = new Case({
                name: template.name,
                description: template.description,
                _type: template._caseType,
                _parent: milestone,
            });

            if (!caseItem._type) throw new Error('caseItem should have _type');

            // Logika biznesowa numeracji
            if (!caseItem._type.isUniquePerMilestone) {
                caseItem.number = 1;
                caseItem.setDisplayNumber();
            }

            // Operacja GD (zewnętrzna)
            await caseItem.createFolder(auth);
            defaultCaseItems.push(caseItem);
        }

        console.log('default cases folders created');

        // 3. Zapisz sprawy w bazie (Repository)
        const caseData = await this.addDefaultCasesInDb(defaultCaseItems);
        console.log('cases saved in db');

        // 4. Dodaj do Scrum (zewnętrzne)
        await this.addDefaultCasesInScrum(milestone, auth, {
            casesData: <any>caseData,
            isPartOfBatch: parameters?.isPartOfBatch,
        });
        console.log('milestone added in scrum');
    }

    private static async addDefaultCasesInDb(caseItems: Case[]) {
        const caseData = [];
        const caseRepository = new CaseRepository();
        let conn: mysql.PoolConnection | undefined;
        try {
            conn = await ToolsDb.getPoolConnectionWithTimeout();
            console.log(
                'new connection created for adding default cases in db',
                conn.threadId
            );
            await conn.beginTransaction();
            for (const caseItem of caseItems) {
                const updatedCaseItem = await caseRepository.addWithRelated(
                    caseItem,
                    [],
                    [],
                    conn
                );
                caseData.push({
                    caseItem: updatedCaseItem,
                    processInstances: [],
                    defaultTasksInDb: [],
                });
            }
            await conn.commit();
        } catch (error) {
            console.error('An error occurred:', error);
            await conn?.rollback();
            throw error;
        } finally {
            conn?.release();
            console.log(
                'connection released after adding default cases in db ',
                conn?.threadId
            );
        }
        return await Promise.all(caseData);
    }

    private static async addDefaultCasesInScrum(
        milestone: Milestone,
        auth: OAuth2Client,
        parameters: {
            casesData: [
                {
                    caseItem: Case;
                    processInstances: ProcessInstance[] | undefined;
                    defaultTasksInDb: Task[];
                }
            ];
            isPartOfBatch?: boolean;
        }
    ) {
        for (const caseData of parameters.casesData)
            await CasesController.addInScrum(
                caseData.caseItem,
                auth,
                caseData.defaultTasksInDb,
                parameters.isPartOfBatch
            );
    }
}
