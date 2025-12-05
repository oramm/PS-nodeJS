import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import BaseController from '../../controllers/BaseController';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';
import { UserData } from '../../types/sessionTypes';
import { MilestoneParentType } from '../../types/types';
import Case from './cases/Case';
import CasesController from './cases/CasesController';
import CaseTemplateRepository from './cases/caseTemplates/CaseTemplateRepository';
import CaseTypeRepository from './cases/caseTypes/CaseTypeRepository';
import Milestone from './Milestone';
import MilestoneRepository, {
    MilestonesSearchParams,
} from './MilestoneRepository';

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
     * @deprecated Użyj addBulkWithDatesAndCases() zamiast tego.
     * Ta metoda NIE tworzy domyślnych Cases z Tasks dla Milestones.
     *
     * Migracja:
     * ```typescript
     * // STARE (bez Cases):
     * await MilestonesController.addBulkWithDates(milestones);
     * for (const m of milestones) await MilestonesController.createDefaultCases(m, auth);
     *
     * // NOWE (z Cases i Tasks):
     * await MilestonesController.addBulkWithDatesAndCases(milestones, auth);
     * ```
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
     * API PUBLICZNE - Dodaje wiele Milestones z datami, Cases i Tasks
     *
     * Spójna struktura: Milestone → Cases → Tasks
     * Dla każdego Milestone:
     * 1. Zapisuje Milestone + Dates do DB
     * 2. Tworzy domyślne Cases z Tasks (createDefaultCases)
     *
     * @param milestones - Tablica Milestones do dodania (muszą mieć już utworzone foldery GD!)
     * @param auth - OAuth2Client dla operacji GD/Scrum
     * @param options - Opcje: isPartOfBatch dla Scrum
     * @returns Promise<Milestone[]> - Dodane Milestones
     */
    static async addBulkWithDatesAndCases(
        milestones: Milestone[],
        auth: OAuth2Client,
        options?: { isPartOfBatch?: boolean }
    ): Promise<Milestone[]> {
        const instance = this.getInstance();

        // 1. Zapisz wszystkie Milestones z Dates do DB
        await instance.repository.addMilestonesWithDates(milestones);
        console.log('Milestones saved in DB');

        // 2. Dla każdego Milestone utwórz Cases z Tasks
        for (const milestone of milestones) {
            console.group(
                `Creating default cases for milestone ${milestone._FolderNumber_TypeName_Name}`
            );
            await MilestonesController.createDefaultCases(milestone, auth, {
                isPartOfBatch: options?.isPartOfBatch ?? true,
            });
            console.groupEnd();
        }

        return milestones;
    }

    /**
     * API PUBLICZNE - Dodaje nowy Milestone z folderami i default cases
     *
     * Przepływ:
     * 1. Model: createFolders(auth) - tworzy folder GD + podfoldery dla case types
     * 2. Controller: transakcja DB
     *    - Repository: addMilestonesWithDates() - dodaje Milestone + Dates
     * 3. Controller: createDefaultCases(auth) - tworzy domyślne sprawy
     * 4. Controller: editMilestoneFolder(auth) - aktualizuje folder (nazwa z numerem)
     * 5. Rollback folderu GD i DB przy błędzie
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
                    await MilestonesController.createFolders(
                        milestone,
                        authClient
                    );
                    console.log('GD folders created');

                    try {
                        // 2. Transakcja DB - Milestone + Dates (pojedynczy insert)
                        await instance.repository.addMilestonesWithDates([
                            milestone,
                        ]);

                        console.log('Milestone added to DB');

                        // 3. Utwórz domyślne sprawy (Cases)
                        await MilestonesController.createDefaultCases(
                            milestone,
                            authClient,
                            {
                                isPartOfBatch: false,
                            }
                        );
                        console.log('Default cases created');

                        // 4. Edytuj folder (zaktualizuj nazwę z numerem)
                        await instance.editMilestoneFolder(
                            authClient,
                            milestone
                        );
                        console.log('Folder name updated');

                        return milestone;
                    } catch (dbError) {
                        // Rollback: usuń folder GD i DB jeśli coś się nie powiodło
                        console.error('DB transaction failed, rolling back');
                        await milestone
                            .deleteFolder(authClient)
                            .catch((error) => {
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
            },
            auth
        );
    }

    /**
     * API PUBLICZNE - Edytuje Milestone
     *
     * Przepływ:
     * 1. Walidacja (typeId, gdFolderId)
     * 2. Transakcja DB - Milestone + Dates (jeśli potrzebne)
     * 3. Równolegle (jeśli nie tylko DB fields):
     *    - editFolder(auth) - aktualizuje folder GD
     *    - editInScrum(auth) - aktualizuje Scrum
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
                    const onlyDbFields = [
                        'status',
                        'description',
                        'number',
                        'name',
                    ];
                    const isOnlyDbFields =
                        fieldsToUpdate &&
                        fieldsToUpdate.length > 0 &&
                        fieldsToUpdate.every((field) =>
                            onlyDbFields.includes(field)
                        );

                    // 1. Transakcja DB - Milestone + Dates
                    await instance.repository.editMilestoneWithDates(
                        milestone,
                        undefined,
                        false,
                        fieldsToUpdate
                    );

                    console.log('Milestone edited in DB');

                    // 2. Równolegle: GD + Scrum (jeśli nie tylko DB fields)
                    if (!isOnlyDbFields) {
                        await Promise.all([
                            instance.editMilestoneFolder(authClient, milestone),
                            milestone.editInScrum(authClient),
                        ]);
                        console.log('Milestone folder edited in GD');
                        console.log('Milestone edited in Scrum');
                    }

                    return milestone;
                } finally {
                    console.groupEnd();
                }
            },
            auth
        );
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
     * Przepływ:
     * 1. Controller: deleteFromDb() - usuwa z DB (CASCADE dla MilestoneDates, Cases)
     * 2. Równolegle:
     *    - deleteFolder(auth) - usuwa folder GD
     *    - deleteFromScrum(auth) - usuwa z Scrum
     *
     * UWAGA: Operacje GD/Scrum są wykonywane po DB i nie wpływają na rollback DB.
     * Jeśli usuniecie z DB się powiedzie, ale GD/Scrum się nie uda, Milestone
     * zostaje usunięty z DB, ale folder/scrum mogą pozostać (do ręcznego usunięcia).
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
                console.group('Deleting Milestone', milestone.id);

                try {
                    // 1. Usuń z bazy (CASCADE usunie też MilestoneDates i powiązane Cases)
                    await instance.repository.deleteFromDb(milestone);
                    console.log('Milestone deleted from DB');

                    // 2. Równolegle: GD + Scrum (błędy nie wpływają na DB)
                    try {
                        await Promise.all([
                            milestone.deleteFolder(authClient),
                            milestone.deleteFromScrum(authClient),
                        ]);
                        console.log('Milestone deleted from GD and Scrum');
                    } catch (gdScrumError) {
                        // Loguj błąd, ale nie rollbackuj DB (już usunięte)
                        console.error(
                            'Error deleting from GD/Scrum (DB already deleted):',
                            gdScrumError
                        );
                    }
                } finally {
                    console.groupEnd();
                }
            },
            auth
        );
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
     * Deleguje do CasesController.addBulkWithDefaultTasks()
     *
     * Hierarchia: Milestone → Cases → Tasks
     * MilestonesController przygotowuje Cases, CasesController tworzy je z Tasks
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

        // 2. Utwórz obiekty spraw (Model) - bez folderów GD
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

            defaultCaseItems.push(caseItem);
        }

        // 3. Deleguj tworzenie Cases z Tasks do CasesController
        // CasesController: tworzy foldery GD, zapisuje do DB, dodaje do Scrum
        await CasesController.addBulkWithDefaultTasks(defaultCaseItems, auth, {
            isPartOfBatch: parameters?.isPartOfBatch ?? true,
        });

        console.log('Default cases with tasks created');
    }
}
