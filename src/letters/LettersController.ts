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

    /** tworzy obiekt odpowiedniej podklasy Letter na podstawie atrybutów */
    static createProperLetter(initParam: any) {
        let item:
            | OurLetterContract
            | OurOldTypeLetter
            | OurLetterOffer
            | IncomingLetterContract
            | IncomingLetterOffer;

        // Our Letter Contract (nowy typ)
        if (
            initParam.isOur &&
            initParam.id == initParam.number &&
            initParam._project?.id
        ) {
            item = new OurLetterContract(initParam);
            if (initParam._contract)
                item.setContractFromClientData(initParam._contract);
            return item;
        }

        // Our Letter Contract (stary typ - OurOldTypeLetter)
        if (initParam.isOur && initParam.id !== initParam.number)
            return new OurOldTypeLetter(initParam);

        // Our Letter Offer
        if (initParam.isOur && initParam._offer?.id)
            return new OurLetterOffer(initParam);

        // Incoming Letter Contract
        if (!initParam.isOur && initParam._project) {
            item = new IncomingLetterContract(initParam);
            if (initParam._contract)
                item.setContractFromClientData(initParam._contract);
            return item;
        }

        // Incoming Letter Offer
        if (!initParam.isOur && initParam._offer?.id)
            return new IncomingLetterOffer(initParam);

        // Błąd - nieprawidłowe dane
        throw new Error(
            `Cannot create Letter instance. Invalid data: ` +
                `isOur: ${initParam.isOur}, ` +
                `id: ${initParam.id}, ` +
                `number: ${initParam.number}, ` +
                `_project: ${initParam._project?.id}, ` +
                `_offer: ${initParam._offer?.id}`
        );
    }

    /**
     * Zatwierdza pismo wychodzące - tworzy zdarzenie APPROVED
     * @param letter - instancja pisma wychodzącego do zatwierdzenia
     * @param auth - klient OAuth2 do operacji Google Drive
     * @param userData - dane użytkownika zatwierdzającego
     */
    static async approveLetter(
        letter: OurLetter,
        auth: OAuth2Client,
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
     * ORKIESTRACJA: Zarządza transakcją i wywołuje odpowiednie metody
     *
     * @param letter - instancja Letter do dodania
     * @returns letter z ustawionym ID
     */
    static async addNew(letter: Letter): Promise<Letter> {
        const instance = this.getInstance();

        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            // 1. Dodaj główny rekord Letter do bazy
            await instance.repository.addInDb(letter, conn, true);

            // 2. Dla OurLetter: ustaw number = id
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
     * Prywatna metoda pomocnicza dla addNew()
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
            await association.addInDb(conn, true);
        }
    }

    /**
     * Dodaje asocjacje Letter-Case
     * Prywatna metoda pomocnicza dla addNew()
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
            await association.addInDb(conn, true);
        }
    }

    /**
     * ORKIESTRACJA: Dodaje nowy OurLetter (pismo wychodzące)
     * Przeniesiona z OurLetter.addNewController()
     *
     * @param letter - instancja OurLetter do dodania
     * @param auth - OAuth2Client dla operacji Google Drive
     * @param files - załączniki
     * @param userData - dane użytkownika
     */
    static async addNewOurLetter(
        letter: OurLetter,
        auth: OAuth2Client,
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
            await this.addNew(letter);

            // 4. Przygotuj operacje post-DB
            const ourLetterGdFile = letter.makeLetterGdFileController(
                letter._template
            );
            if (!letter.number)
                throw new Error(`Letter number not set for: ${letter.id}`);
            if (!letter.creationDate)
                throw new Error(
                    `Letter creationDate is not set for: ${letter.id}`
                );

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
            if (letter.gdDocumentId && letter._cases.length > 0) {
                const shortcutCreationPromises = letter._cases.map(
                    async (caseItem) => {
                        if (caseItem.gdFolderId) {
                            const lettersSubfolder = await ToolsGd.setFolder(
                                auth,
                                {
                                    parentId: caseItem.gdFolderId,
                                    name: 'Pisma',
                                }
                            );

                            await ToolsGd.createShortcut(auth, {
                                targetId: letter.gdDocumentId!,
                                parentId: lettersSubfolder.id!,
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
            // Rollback w przypadku błędu
            if (letter.id) letter.deleteFromDb();
            letter._letterGdController.deleteFromGd(
                auth,
                null,
                letter.gdFolderId
            );
            throw err;
        }
    }

    /**
     * ORKIESTRACJA: Dodaje nowy IncomingLetter (pismo przychodzące)
     * Przeniesiona z IncomingLetter.addNewController()
     *
     * @param letter - instancja IncomingLetter do dodania
     * @param auth - OAuth2Client dla operacji Google Drive
     * @param files - załączniki
     * @param userData - dane użytkownika
     */
    static async addNewIncomingLetter(
        letter: IncomingLetter,
        auth: OAuth2Client,
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
            await this.addNew(letter);

            // 3. Utwórz skróty w folderach Cases
            if (letter.gdDocumentId && letter._cases.length > 0) {
                const shortcutPromises = letter._cases.map(async (caseItem) => {
                    if (caseItem.gdFolderId) {
                        const lettersSubfolder = await ToolsGd.setFolder(auth, {
                            parentId: caseItem.gdFolderId,
                            name: 'Pisma',
                        });

                        await ToolsGd.createShortcut(auth, {
                            targetId: letter.gdDocumentId!,
                            parentId: lettersSubfolder.id!,
                            name: `${letter.number} ${letter.description}`,
                        });
                    }
                });
                await Promise.all(shortcutPromises);
            }

            // 4. Utwórz Letter Event
            await letter.createNewLetterEvent(userData);
        } catch (err) {
            // Rollback w przypadku błędu
            letter.deleteFromDb();
            letter._letterGdController.deleteFromGd(
                auth,
                letter.gdFolderId || letter.gdDocumentId
            );
            throw err;
        }
    }
}
