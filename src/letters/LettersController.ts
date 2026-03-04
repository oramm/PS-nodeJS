import ToolsDb from '../tools/ToolsDb';
import Letter from './Letter';
import OurOldTypeLetter from './OurOldTypeLetter';
import OurLetterContract from './OurLetterContract';
import IncomingLetterOffer from './IncomingLetterOffer';
import IncomingLetterContract from './IncomingLetterContract';
import OurLetterOffer from './OurLetterOffer';
import LetterEvent from './letterEvent/LetterEvent';
import { UserData } from '../types/sessionTypes';
import LetterRepository, { LetterSearchParams } from './LetterRepository';
import OurLetter from './OurLetter';
import { OAuth2Client } from 'google-auth-library';
import PersonsController from '../persons/PersonsController';
import Setup from '../setup/Setup';
import LetterEventsController from './letterEvent/LetterEventsController';
import BaseController from '../controllers/BaseController';
import mysql from 'mysql2/promise';
import LetterEntity from './associations/LetterEntity';
import LetterCase from './associations/LetterCase';
import ToolsGd from '../tools/ToolsGd';
import IncomingLetter from './IncomingLetter';
import LetterValidator from './LetterValidator';
import LetterEntityAssociationsController from './associations/LetterEntityAssociationsController';
import ToolsAI from '../tools/ToolsAI';
import { EntityData } from '../types/types';
import EntitiesController from '../entities/EntitiesController';
import LetterCaseAssociationsController from './associations/LetterCaseAssociationsController';

export default class LettersController extends BaseController<
    Letter,
    LetterRepository
> {
    private static instance: LettersController;

    constructor() {
        super(new LetterRepository());
    }

    // Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
    private static getInstance(): LettersController {
        if (!this.instance) {
            this.instance = new LettersController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę listów na podstawie warunków wyszukiwania
     * @param orConditions - warunki wyszukiwania połączone operatorem OR
     * @param milestoneParentType - typ rodzica kamienia milowego (CONTRACT lub OFFER)
     * @param userData - dane użytkownika
     * @returns lista listów (instancje odpowiednich klas Letter)
     */
    static async find(
        orConditions: LetterSearchParams[],
        milestoneParentType: 'CONTRACT' | 'OFFER',
        userData: UserData
    ): Promise<Letter[]> {
        const instance = this.getInstance();
        // Repository zwraca już pełne instancje Letter (polimorfizm)
        return await instance.repository.find({
            orConditions,
            milestoneParentType,
            userData,
        });
    }

    /**
     * Tworzy obiekt odpowiedniej podklasy Letter na podstawie atrybutów
     *
     * REFAKTORING: Dodano walidację przez LetterValidator przed utworzeniem instancji
     *
     * @param initParam - dane z klienta
     * @returns instancja odpowiedniego typu Letter
     * @throws Error jeśli dane są niepełne lub niespójne
     */
    static createProperLetter(initParam: any): Letter {
        // 1. WALIDACJA TYPU - przez LetterValidator
        const validation = LetterValidator.validateLetterTypeData(initParam);
        console.log('🔍 Validation result:', validation);

        if (!validation.isValid) {
            const errorMessage = LetterValidator.formatValidationError(
                initParam,
                validation
            );
            throw new Error(errorMessage);
        }

        // 2. TWORZENIE INSTANCJI (z log diagnostycznym)
        console.log(`✅ Creating ${validation.expectedType}`);

        let item:
            | OurLetterContract
            | OurOldTypeLetter
            | OurLetterOffer
            | IncomingLetterContract
            | IncomingLetterOffer;

        const isNewLetter = !initParam.id;

        // Our Letter Contract (nowy typ) - nowe pismo lub edycja gdy id == number
        if (
            initParam.isOur &&
            initParam._project?.id &&
            (isNewLetter || initParam.id == initParam.number)
        ) {
            item = new OurLetterContract(initParam);
            if (initParam._contract)
                item.setContractFromClientData(initParam._contract);
            return item;
        }

        // Our Letter Contract (stary typ - OurOldTypeLetter) - tylko edycja istniejącego pisma
        if (
            initParam.isOur &&
            !isNewLetter &&
            initParam.id !== initParam.number
        ) {
            return new OurOldTypeLetter(initParam);
        }

        // Our Letter Offer
        if (initParam.isOur && initParam._offer?.id) {
            item = new OurLetterOffer(initParam);
            return item;
        }

        // Incoming Letter Contract
        if (!initParam.isOur && initParam._project) {
            item = new IncomingLetterContract(initParam);
            if (initParam._contract)
                item.setContractFromClientData(initParam._contract);
            return item;
        }

        // Incoming Letter Offer
        if (!initParam.isOur && initParam._offer?.id) {
            item = new IncomingLetterOffer(initParam);
            return item;
        }

        // Ten kod nigdy nie powinien być osiągnięty (walidacja wyżej to wyłapie)
        throw new Error(
            `INTERNAL ERROR: Validation passed but no matching type found. ` +
                `This should never happen! Expected type: ${validation.expectedType}`
        );
    }

    /**
     * PUBLIC API: Zatwierdza pismo wychodzące
     * Tworzy event APPROVED i aktualizuje letter._lastEvent
     *
     * @param letter - instancja pisma wychodzącego do zatwierdzenia
     * @param userData - dane użytkownika zatwierdzającego
     */
    static async approveLetter(
        letter: OurLetter,
        userData: UserData
    ): Promise<void> {
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );
        letter._lastEvent = new LetterEvent({
            letterId: letter.id,
            eventType: Setup.LetterEventType.APPROVED,
            _editor,
        });
        await LetterEventsController.addNew(letter._lastEvent);
    }

    /**
     * Dodaje wpisy APPROVED do listów, które nie mają jeszcze takiego wpisu
     * (delegacja do Repository)
     */
    static async autoApprove(): Promise<void> {
        const instance = this.getInstance();
        return instance.repository.autoApprove();
    }

    /**
     * Dodaje nowy list do bazy danych wraz z asocjacjami
     *
     * ORKIESTRACJA: Zarządza transakcją i wywołuje odpowiednie metody
     * REFAKTORING: Funkcjonalność przeniesiona z Letter.addInDb()
     *
     * Proces:
     * 1. Dodaje główny rekord Letter do bazy (przez Repository)
     * 2. Dla OurLetter: ustawia number = id
     * 3. Dodaje asocjacje Letter-Entity (MAIN i CC)
     * 4. Dodaje asocjacje Letter-Case
     *
     * Wszystko w ramach jednej transakcji - jeśli coś się nie powiedzie, rollback.
     *
     * @param letter - instancja Letter do dodania (OurLetter lub IncomingLetter)
     * @returns letter z ustawionym ID i asocjacjami
     */
    static async addNew(letter: Letter): Promise<Letter> {
        const instance = this.getInstance();

        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            // 1. Dodaj główny rekord Letter do bazy
            await instance.repository.addInDb(letter, conn, true);

            // 2. Dla OurLetter: ustaw number = id
            // WAŻNE: Nowy OurLetter przychodzi bez number (undefined) - ustawiamy go tutaj po zapisie
            //        Edycja OurLetter: Validator sprawdził że number już istnieje
            // Ten krok zapewnia że number === id dla wszystkich OurLetterContract
            if (letter instanceof OurLetter) {
                letter.number = letter.id;
            }

            // 3. Dodaj asocjacje z Entities (MAIN i CC)
            await this.addEntitiesAssociations(letter, conn);

            // 4. Dodaj asocjacje z Cases
            await this.addCaseAssociations(letter, conn);

            return letter;
        });
    }

    /**
     * Dodaje asocjacje Letter-Entity (MAIN i CC)
     *
     * REFAKTORING: Logika przeniesiona z Letter.addEntitiesAssociationsInDb()
     * Prywatna metoda pomocnicza dla addNew() - wykonywana w ramach transakcji
     *
     * @param letter - Letter z wypełnionymi _entitiesMain i _entitiesCc
     * @param conn - połączenie do bazy (część transakcji)
     */
    private static async addEntitiesAssociations(
        letter: Letter,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const entityAssociations: LetterEntity[] = [];

        // Asocjacje MAIN
        letter._entitiesMain.forEach((item) => {
            entityAssociations.push(
                new LetterEntity({
                    letterRole: 'MAIN',
                    _letter: letter,
                    _entity: item,
                })
            );
        });

        // Asocjacje CC
        letter._entitiesCc.forEach((item) => {
            entityAssociations.push(
                new LetterEntity({
                    letterRole: 'CC',
                    _letter: letter,
                    _entity: item,
                })
            );
        });

        // Zapis do bazy w ramach transakcji
        for (const association of entityAssociations) {
            await LetterEntityAssociationsController.add(
                association,
                conn,
                true
            );
        }
    }

    /**
     * Dodaje asocjacje Letter-Case
     *
     * REFAKTORING: Logika przeniesiona z Letter.addCaseAssociationsInDb()
     * Prywatna metoda pomocnicza dla addNew() - wykonywana w ramach transakcji
     *
     * @param letter - Letter z wypełnionymi _cases
     * @param conn - połączenie do bazy (część transakcji)
     */
    private static async addCaseAssociations(
        letter: Letter,
        conn: mysql.PoolConnection
    ): Promise<void> {
        const caseAssociations: LetterCase[] = [];

        letter._cases.forEach((item) => {
            caseAssociations.push(
                new LetterCase({
                    _letter: letter,
                    _case: item,
                })
            );
        });

        // Zapis do bazy w ramach transakcji
        for (const association of caseAssociations) {
            await LetterCaseAssociationsController.add(association, conn, true);
        }
    }

    /**
     * PUBLIC API: Dodaje nowy OurLetter (pismo wychodzące)
     *
     * @param letter - instancja OurLetter do dodania
     * @param files - załączniki
     * @param userData - dane użytkownika
     * @param auth - opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     */
    static async addNewOurLetter(
        letter: OurLetter,
        files: Express.Multer.File[] = [],
        userData: UserData,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: LettersController,
                authClient: OAuth2Client
            ): Promise<void> => {
                return await instance.addNewOurLetterPrivate(
                    authClient,
                    letter,
                    files,
                    userData
                );
            },
            auth
        );
    }

    /**
     * PRIVATE: Logika dodawania OurLetter
     * Przeniesiona z OurLetter.addNewController()
     */
    private async addNewOurLetterPrivate(
        auth: OAuth2Client,
        letter: OurLetter,
        files: Express.Multer.File[] = [],
        userData: UserData
    ): Promise<void> {
        try {
            // 1. Utwórz folder GD dla pisma
            const gdFolder =
                await letter._letterGdController.createLetterFolder(auth, {
                    ...letter,
                });
            letter.gdFolderId = <string>gdFolder.id;
            letter._gdFolderUrl = ToolsGd.createGdFolderUrl(letter.gdFolderId);

            // 2. Utwórz plik dokumentu GD
            const letterGdFile = await letter.createLetterFile(auth);
            letter.gdDocumentId = <string>letterGdFile.documentId;
            letter._documentOpenUrl = ToolsGd.createDocumentOpenUrl(
                letter.gdDocumentId
            );

            // 3. Dodaj do bazy danych (z transakcją i asocjacjami)
            await LettersController.addNew(letter);

            // 4. Przygotuj operacje post-DB
            const ourLetterGdFile = letter.makeLetterGdFileController(
                letter._template
            );
            // Validator gwarantuje że number istnieje, addNew() ustawia number = id
            if (!letter.number || !letter.creationDate) {
                throw new Error(
                    `Letter number or creationDate not set for: ${letter.id}`
                );
            }

            const folderName = letter._letterGdController.makeFolderName(
                letter.number.toString(),
                letter.creationDate
            );

            const postDbPromises: Promise<any>[] = [
                ourLetterGdFile.updateTextRunsInNamedRanges(auth),
                ToolsGd.updateFolder(auth, {
                    id: letter.gdFolderId,
                    name: folderName,
                }),
                ToolsGd.updateFile(auth, {
                    id: letter.gdDocumentId,
                    name: folderName,
                }),
            ];

            if (files.length > 0) {
                postDbPromises.push(
                    letter.appendAttachmentsHandler(auth, files)
                );
            }

            // 5. Utwórz skróty w folderach Cases
            if (
                (letter.gdDocumentId || letter.gdFolderId) &&
                letter._cases.length > 0
            ) {
                const shortcutCreationPromises = letter._cases.map(
                    async (caseItem) => {
                        if (caseItem.gdFolderId) {
                            const targetId = letter.gdDocumentId
                                ? letter.gdDocumentId
                                : letter.gdFolderId;

                            await ToolsGd.createShortcut(auth, {
                                targetId: targetId!,
                                parentId: caseItem.gdFolderId,
                                name: `${letter.number} ${letter.description}`,
                            });
                        }
                    }
                );
                await Promise.all(shortcutCreationPromises);
            }

            // 6. Wykonaj wszystkie operacje post-DB
            await Promise.all(postDbPromises);
            console.log('Finished all post-DB operations including shortcuts.');

            // 7. Utwórz Letter Event
            await letter.createNewLetterEvent(userData);
        } catch (err) {
            // Rollback w przypadku błędu - używamy LettersController.delete
            if (letter.id) await this.delete(letter);
            letter._letterGdController.deleteFromGd(
                auth,
                null,
                letter.gdFolderId
            );
            throw err;
        }
    }

    /**
     * PUBLIC API: Dodaje nowy IncomingLetter (pismo przychodzące)
     *
     * @param letter - instancja IncomingLetter do dodania
     * @param files - załączniki
     * @param userData - dane użytkownika
     * @param auth - opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     */
    static async addNewIncomingLetter(
        letter: IncomingLetter,
        files: Express.Multer.File[] = [],
        userData: UserData,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: LettersController,
                authClient: OAuth2Client
            ): Promise<void> => {
                return await instance.addNewIncomingLetterPrivate(
                    authClient,
                    letter,
                    files,
                    userData
                );
            },
            auth
        );
    }

    /**
     * PRIVATE: Logika dodawania IncomingLetter
     * Przeniesiona z IncomingLetter.addNewController()
     */
    private async addNewIncomingLetterPrivate(
        auth: OAuth2Client,
        letter: IncomingLetter,
        files: Express.Multer.File[] = [],
        userData: UserData
    ): Promise<void> {
        try {
            // 1. Obsłuż pliki
            letter.letterFilesCount = files.length;
            if (files.length > 1) {
                await letter.initAttachmentsHandler(auth, files);
            } else {
                const letterGdFile = await letter.createLetterFile(
                    auth,
                    files[0]
                );
                if (!letterGdFile.id)
                    throw new Error('IncomingLetter: GD file id not created');
                letter.setDataToSingleFileState(letterGdFile.id);
            }

            // 2. Dodaj do bazy danych (z transakcją i asocjacjami)
            await LettersController.addNew(letter);

            // 3. Utwórz skróty w folderach Cases
            if (
                (letter.gdDocumentId || letter.gdFolderId) &&
                letter._cases.length > 0
            ) {
                const shortcutPromises = letter._cases.map(async (caseItem) => {
                    if (caseItem.gdFolderId) {
                        const targetId = letter.gdDocumentId
                            ? letter.gdDocumentId
                            : letter.gdFolderId;

                        await ToolsGd.createShortcut(auth, {
                            targetId: targetId!,
                            parentId: caseItem.gdFolderId,
                            name: `${letter.number} ${letter.description}`,
                        });
                    }
                });
                await Promise.all(shortcutPromises);
            }

            // 4. Utwórz Letter Event
            await letter.createNewLetterEvent(userData);
        } catch (err) {
            // Rollback w przypadku błędu - używamy LettersController.delete
            if (letter.id) await this.delete(letter);
            letter._letterGdController.deleteFromGd(
                auth,
                letter.gdFolderId || letter.gdDocumentId
            );
            throw err;
        }
    }

    /**
     * Edytuje Letter w bazie danych wraz z aktualizacją asocjacji
     *
     * REFAKTORING: Logika przeniesiona z Letter.editInDb()
     * ORKIESTRACJA: Zarządza transakcją i selektywną aktualizacją asocjacji
     *
     * @param letter - Letter do edycji (z zaktualizowanymi danymi)
     * @param fieldsToUpdate - opcjonalna lista pól do aktualizacji
     * @returns Promise<void>
     */
    static async edit(
        letter: Letter,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        const instance = this.getInstance();
        console.log('Letter edit in Db Start');

        await ToolsDb.transaction(async (conn) => {
            const shouldUpdateCases =
                !fieldsToUpdate || fieldsToUpdate.includes('_cases');
            const shouldUpdateEntities =
                !fieldsToUpdate ||
                fieldsToUpdate.includes('_entitiesMain') ||
                fieldsToUpdate.includes('_entitiesCc');

            const dbOperations: Promise<any>[] = [
                instance.repository
                    .editInDb(letter, conn, true, fieldsToUpdate)
                    .then(() => {
                        console.log('letterData edited');
                    }),
            ];

            if (shouldUpdateCases) {
                dbOperations.push(this.editCaseAssociations(letter, conn));
            }
            if (shouldUpdateEntities) {
                dbOperations.push(this.editEntitiesAssociations(letter, conn));
            }

            await Promise.all(dbOperations);
            console.log('associations renewed');
        });
    }

    /**
     * Edytuje asocjacje Letter-Entity
     *
     * REFAKTORING: Logika przeniesiona z Letter.editEntitiesAssociationsInDb()
     * Kasuje stare asocjacje i tworzy nowe
     *
     * @param letter - Letter z zaktualizowanymi _entitiesMain i _entitiesCc
     * @param conn - połączenie do bazy (część transakcji)
     */
    private static async editEntitiesAssociations(
        letter: Letter,
        conn: mysql.PoolConnection
    ): Promise<void> {
        await this.deleteEntitiesAssociations(letter);
        await this.addEntitiesAssociations(letter, conn);
    }

    /**
     * Edytuje asocjacje Letter-Case
     *
     * REFAKTORING: Logika przeniesiona z Letter.editCasesAssociationsInDb()
     * Kasuje stare asocjacje i tworzy nowe
     *
     * @param letter - Letter z zaktualizowanymi _cases
     * @param conn - połączenie do bazy (część transakcji)
     */
    private static async editCaseAssociations(
        letter: Letter,
        conn: mysql.PoolConnection
    ): Promise<void> {
        await this.deleteCaseAssociations(letter);
        await this.addCaseAssociations(letter, conn);
    }

    /**
     * Usuwa wszystkie asocjacje Letter-Entity dla danego Letter
     *
     * REFAKTORING: Logika przeniesiona z Letter.deleteEntitiesAssociationsFromDb()
     *
     * @param letter - Letter którego asocjacje mają być usunięte
     */
    private static async deleteEntitiesAssociations(
        letter: Letter
    ): Promise<void> {
        const sql = `DELETE FROM Letters_Entities WHERE LetterId = ?`;
        await ToolsDb.executePreparedStmt(sql, [letter.id], letter);
    }

    /**
     * Usuwa wszystkie asocjacje Letter-Case dla danego Letter
     *
     * REFAKTORING: Logika przeniesiona z Letter.deleteCasesAssociationsFromDb()
     *
     * @param letter - Letter którego asocjacje mają być usunięte
     */
    private static async deleteCaseAssociations(letter: Letter): Promise<void> {
        const sql = `DELETE FROM Letters_Cases WHERE LetterId = ?`;
        await ToolsDb.executePreparedStmt(sql, [letter.id], letter);
    }

    /**
     * PUBLIC API: Edytuje Letter (zarówno DB jak i GD)
     *
     * @param letter - Letter do edycji
     * @param files - nowe pliki/załączniki
     * @param userData - dane użytkownika
     * @param fieldsToUpdate - opcjonalna lista pól do aktualizacji
     * @param auth - opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     */
    static async editLetter(
        letter: Letter,
        files: Express.Multer.File[],
        userData: UserData,
        fieldsToUpdate?: string[],
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: LettersController,
                authClient: OAuth2Client
            ): Promise<void> => {
                return await instance.editLetterPrivate(
                    authClient,
                    letter,
                    files,
                    userData,
                    fieldsToUpdate
                );
            },
            auth
        );
    }

    /**
     * PRIVATE: Logika edycji Letter
     * REFAKTORING: Logika przeniesiona z Letter.editController()
     * ORKIESTRACJA: Decyduje czy aktualizować tylko DB czy też GD
     */
    private async editLetterPrivate(
        auth: OAuth2Client,
        letter: Letter,
        files: Express.Multer.File[],
        userData: UserData,
        fieldsToUpdate?: string[]
    ): Promise<void> {
        const onlyDbFields = [
            'status',
            'description',
            'number',
            'name',
            'editorId',
        ];
        const isOnlyDbFields =
            fieldsToUpdate &&
            fieldsToUpdate?.length > 0 &&
            fieldsToUpdate.every((field) => onlyDbFields.includes(field));

        console.group('Letter edit');

        // 1. Edytuj w bazie danych
        await LettersController.edit(letter, fieldsToUpdate);
        console.log('Letter edited in DB');

        // 2. Jeśli zmieniono więcej niż tylko pola DB, edytuj też GD
        if (!isOnlyDbFields) {
            await letter.editLetterGdElements(auth, files);
            console.log('Letter folder and file in GD edited');

            // Po operacjach na Google Drive mogą zmienić się identyfikatory
            // plików/folderów (gdDocumentId, gdFolderId) oraz liczba plików.
            // Zapisz te zmiany w bazie danych, aby linki w aplikacji wskazywały
            // na nowo utworzone zasoby.
            try {
                await LettersController.edit(letter);
                console.log('Letter GD-related fields persisted to DB');
            } catch (err) {
                console.error('Failed to persist GD changes to DB:', err);
            }
        }

        // 3. Jeśli zmieniono status na "Zatwierdzony", utwórz event APPROVED
        const statusChanged =
            !fieldsToUpdate || fieldsToUpdate.includes('status');
        if (
            statusChanged &&
            (letter.status === 'Zatwierdzony' ||
                letter.status === Setup.LetterStatus.APPROVED)
        ) {
            if (letter instanceof OurLetter) {
                await LettersController.approveLetter(letter, userData);
            }
        }

        console.groupEnd();
    }

    /**
     * Usuwa Letter z bazy danych
     *
     * REFAKTORING: Używa Repository.deleteFromDb() zamiast letter.deleteFromDb()
     * UWAGA: Asocjacje (Letter-Entity, Letter-Case) są usuwane automatycznie przez CASCADE w bazie
     *
     * @param letter - Letter do usunięcia
     */
    static async delete(letter: Letter): Promise<void> {
        if (!letter.id) throw new Error('No letter id');
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(letter);
    }

    /**
     * PUBLIC API: Dodaje załączniki do istniejącego Letter
     *
     * @param letter - Letter do którego dodajemy załączniki
     * @param blobEnviObjects - obiekty blob do przesłania
     * @param auth - opcjonalny OAuth2Client
     */
    static async appendAttachments(
        letter: Letter,
        blobEnviObjects: any[],
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: LettersController,
                authClient: OAuth2Client
            ): Promise<void> => {
                return await instance.appendAttachmentsPrivate(
                    authClient,
                    letter,
                    blobEnviObjects
                );
            },
            auth
        );
    }

    /**
     * PRIVATE: Logika dodawania załączników
     */
    private async appendAttachmentsPrivate(
        auth: OAuth2Client,
        letter: Letter,
        blobEnviObjects: any[]
    ): Promise<void> {
        // 1. Dodaj załączniki do GD
        await letter.appendAttachmentsHandler(auth, blobEnviObjects);

        // 2. Aktualizuj Letter w bazie danych
        await LettersController.edit(letter);
    }

    /**
     * PUBLIC API: Usuwa Letter z Google Drive
     *
     * @param letter - Letter do usunięcia z GD
     * @param auth - opcjonalny OAuth2Client
     */
    static async deleteFromGd(
        letter: OurLetter | IncomingLetter,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: LettersController,
                authClient: OAuth2Client
            ): Promise<void> => {
                return await instance.deleteFromGdPrivate(authClient, letter);
            },
            auth
        );
    }

    /**
     * PRIVATE: Logika usuwania Letter z Google Drive
     */
    private async deleteFromGdPrivate(
        auth: OAuth2Client,
        letter: OurLetter | IncomingLetter
    ): Promise<void> {
        await letter._letterGdController.deleteFromGd(
            auth,
            letter.gdDocumentId || null,
            letter.gdFolderId || null
        );
    }

    /**
     * PUBLIC API: Eksportuje OurLetter do PDF
     *
     * @param letter - OurLetter do wyeksportowania
     * @param auth - opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
     */
    static async exportToPDF(
        letter: OurLetter,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth<void>(
            async (
                instance: LettersController,
                authClient: OAuth2Client
            ): Promise<void> => {
                return await instance.exportToPDFPrivate(authClient, letter);
            },
            auth
        );
    }

    /**
     * PRIVATE: Logika eksportu do PDF
     * ORKIESTRACJA: Deleguje do OurLetter.exportToPDF()
     */
    private async exportToPDFPrivate(
        auth: OAuth2Client,
        letter: OurLetter
    ): Promise<void> {
        await letter.exportToPDF(auth);
    }

    /**
     * Analizuje przesłany plik (PDF/DOCX) przy użyciu AI i zwraca rozpoznane metadane pisma.
     *
     * @param file - plik przesłany przez multer (buffer)
     * @returns obiekt z polami { value, confidence } dla każdego rozpoznanego pola
     */
    static async analyzeDocument(file: Express.Multer.File): Promise<any> {
        const { aiResult, text, _model, _usage } = await ToolsAI.analyzeDocument(file);

        // Normalize AI output into frontend-friendly schema:
        const normalizeValue = (v: any) => {
            if (v === null || v === undefined) return null;
            if (typeof v === 'string') {
                const trimmed = v.trim();
                if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase().startsWith('brak')) return null;
                return trimmed;
            }
            return v;
        };

        const fieldConfidence = (v: any) => (v ? 3 : 1);

        const normalized = {
            number: { value: normalizeValue(aiResult.number) ?? null, confidence: fieldConfidence(aiResult.number) },
            creationDate: { value: normalizeValue(aiResult.creationDate) ?? null, confidence: fieldConfidence(aiResult.creationDate) },
            description: { value: normalizeValue(aiResult.description) ?? null, confidence: fieldConfidence(aiResult.description) },
            responseDueDate: { value: normalizeValue(aiResult.responseDueDate) ?? null, confidence: fieldConfidence(aiResult.responseDueDate) },
            senderName: { value: normalizeValue(aiResult.senderName) ?? null, confidence: fieldConfidence(aiResult.senderName) },
        };

        // Wzbogacenie danych: Wyszukaj encję w bazie danych (używamy znormalizowanej wartości senderName)
        let senderEntity: EntityData[] = [];
        const senderValue = normalized.senderName.value;
        if (senderValue) {
            const foundEntities = await EntitiesController.find([
                { name: senderValue },
            ]);
            if (foundEntities.length > 0) senderEntity = foundEntities;
        }

        // Zwracamy obiekt w kształcie oczekiwanym przez front-end: każde pole ma { value, confidence }
        const analyzedFile = reqFileToAnalyzedFile(file);
        return {
            number: normalized.number,
            creationDate: normalized.creationDate,
            description: normalized.description,
            responseDueDate: normalized.responseDueDate,
            senderName: normalized.senderName,
            _entitiesMain: {
                value: senderEntity,
                confidence: senderEntity.length > 0 ? 3 : 1,
            },
            _extractedText: text,
            _aiRaw: aiResult,
            _analyzedFile: analyzedFile,
            _model,
            _usage,
        };
    }
}

/**
 * Helper: konwertuje plik Multer na obiekt z base64 dla frontendu
 */
function reqFileToAnalyzedFile(file: Express.Multer.File): { name: string; mime: string; base64: string } {
    const base64 = file && file.buffer ? file.buffer.toString('base64') : '';
    return {
        name: file?.originalname || 'file',
        mime: file?.mimetype || 'application/octet-stream',
        base64,
    };
}
