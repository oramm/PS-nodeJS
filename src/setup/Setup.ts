import { ImapFlowOptions, Logger } from 'imapflow';
import mysql from 'mysql2/promise';

export default class Setup {
    static dbConfig: mysql.PoolOptions = {
        connectionLimit: 10,
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
        timezone: '+00:00',
    };

    static biuroImapMailClient: ImapFlowOptions = {
        host: process.env.BIURO_IMAP_HOST as string,
        port: parseInt(process.env.BIURO_IMAP_PORT!),
        secure: process.env.BIURO_IMAP_SECURE === 'true',
        auth: {
            user: process.env.BIURO_IMAP_USER as string,
            pass: process.env.BIURO_IMAP_PASSWORD as string,
        },
        logger: {
            debug: () => {}, // Wyłącz DEBUG
            info: () => {}, // Wyłącz INFO
            warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
            error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
        },
    };

    static Gd = {
        rootFolderId: '1C_wMgQJtzsFmgsmHp7Dr_F1VJx4v1mjo',
        meetingProtocoTemlateId: '1B5D2ZUkPgNft0-0JZCtkxSk8eAZa91DnwQY8Bbln9Bo',
        offersRootFolderId: '0B2pP2WpBR244WDgzT0RHcmFCMW8',
        ourOfferTemplateGdId: '173TvhbPAgRD_08Ey5cq4PP8RxOmCh4vO-UjjzB5dGro',
        financialAidProgrammesRootFolderId: '1_RCqZ_uSYM0z-akgJwrQlBeaJW2OKn0T',
    };

    static ScrumSheet = {
        GdId: '13j9WZTEJfdjQThxzqd_aQM_1CAnqQPrfQ26v7r4wmBE',
        Planning: {
            id: 830733384,
            firstDataRow: 3,
            name: 'planowanie',
            personIdColName: 'Osoba',
            workingDaysColName: 'liczba dni pracy',
            workingHoursColName: 'liczba godzin pracy',
            freeHoursColName: 'odbierane godziny',
            hoursAvailableColName: 'liczba godzin w tygodniu',
            /**drugi wiersz */
            planningMeetingColName: 'planowanie',
            /**drugi wiersz */
            retrospectionMeetingColName: 'spotkanie końcowe',
            /**drugi wiersz */
            extraMeetingsColName: 'dodatkowe spotkania',
        },
        CurrentSprint: {
            id: 223354508,
            firstDataRow: 4,
            name: 'aktualny sprint',
            projectIdColName: 'Id projektu',
            contractDbIdColName: 'dbId kontraktu',
            contractOurIdColName: 'ourId kontraktu',
            milestoneIdColName: 'Id kamienia milowego',
            caseTypeIdColName: 'Id typu sprawy',
            caseIdColName: 'Id sprawy',
            taskIdColName: 'Id zadania',
            rowStatusColName: '#ImportStatus',
            contractNumberColName: 'Nr kontraktu na roboty/ dostawy',
            milestoneNameColName: 'Typ i nazwa kamienia milowego',

            caseTypeColName: 'Typ sprawy I numer sprawy',
            caseNameColName: 'Nazwa sprawy',
            taskNameColName: 'Nazwa zadania',
            taskDeadlineColName: 'Deadline',
            taskEstimatedTimeColName: 'szac. czas',
            taskStatusColName: 'Status',
            taskOwnerIdColName: 'Id właściciela',
            taskOwnerNameColName: 'Kto',
            /**drugi wiersz */
            monColName: 'PON.',
            /**drugi wiersz */
            tueColName: 'WTO.',
            /**drugi wiersz */
            wedColName: 'SR.',
            /**drugi wiersz */
            thuColName: 'CZW.',
            /**drugi wiersz */
            friColName: 'PT.',
            /**drugi wiersz */
            sprintSumColName: 'Razem',
            /**drugi wiersz */
            sprintDiffColName: 'Różnica',
            modeColName: 'tryb',

            timesSummaryColName: '#TimesSummary',
            /**Formuły z czasami dla osób*/
            timesColName: '#Times',
        },
        Data: {
            id: 2143933154,
            firstDataRow: 2,
            name: 'dane',
            personIdColName: 'OwnerId',
            personNameColName: 'lista osób - zasoby',
            caseIdColName: 'CaseId',
            caseTypeIdColName: 'CaseTypeId',
            case_milestoneIdColName: 'Case_MilestoneId',
            caseNameColName: 'CaseName',
            caseGdFolderIdColName: 'Case_gdFolderId',
        },
    };

    static CaseTypes = {
        SECURITY_GUARANTEE: 99,
    };

    static MilestoneTypes = {
        OURCONTRACT_ADMINISTRATION: 1,
        OFFER_SUBMISSION: 51,
        OFFER_EVALUATION: 52,
    };

    static InvoiceStatus = {
        FOR_LATER: 'Na później',
        TO_DO: 'Do zrobienia',
        DONE: 'Zrobiona',
        SENT: 'Wysłana',
        PAID: 'Zapłacona',
        TO_CORRECT: 'Do korekty',
        WITHDRAWN: 'Wycofana',
    };

    static ProjectStatuses = {
        NOT_STARTED: 'Nie rozpoczęty',
        IN_PROGRESS: 'W trakcie',
        FINISHED: 'Zakończony',
    };

    static ContractStatus = {
        NOT_STARTED: 'Nie rozpoczęty',
        IN_PROGRESS: 'W trakcie',
        FINISHED: 'Zakończony',
        ARCHIVAL: 'Archiwalny',
    };

    static SecurityStatus = {
        NOT_ISSUED: 'Nie wydana',
        ISSUED: 'Wydana',
        TO_PROLONG: 'Do przedłużenia',
        PROLONGED: 'Przedłużona',
        RETURNED_1ST_PART: 'Zwrócona 70%',
        RETURNED_2ND_PART: 'Zwrócona 100%',
    };

    static TaskStatus = {
        BACKLOG: 'Backlog',
        NOT_STARTED: 'Nie rozpoczęty',
        IN_PROGRESS: 'W trakcie',
        TO_CORRECT: 'Do poprawy',
        AWAITING_RESPONSE: 'Oczekiwanie na odpowiedź',
        DONE: 'Zrobione',
    };

    static OfferStatus = {
        DECISION_PENDING: 'Składamy czy nie?',
        TO_DO: 'Do złożenia',
        DONE: 'Czekamy na wynik',
        AWARDED: 'Wygrana',
        LOST: 'Przegrana',
        CANCELED: 'Unieważnione',
        WITHDRAWN: 'Wycofana',
        NOT_INTERESTED: 'Nie składamy',
    };

    static OfferBondStatus = {
        NEW: 'Jeszcze nie płacić',
        TO_PAY: 'Do zapłacenia',
        PAID: 'Zapłacone',
        TO_RENEW: 'Do przedłużenia',
        DONE: 'Złożone',
        TO_BE_RETURNED: 'Do zwrotu',
        RETURNED: 'Zwrócone',
    };

    static OfferInvitationMailStatus = {
        NEW: 'Nowy',
        TO_OFFER: 'Przekazać do ofertowania',
        DONE: 'Oferta utworzona',
        REJECTED: 'Odrzucony',
    };

    static OfferBondForm = {
        CASH: 'Gotówka',
        GUARANTEE: 'Gwarancja',
    };

    static OfferEventType = {
        CREATED: 'Oferta Utworzona',
        SENT: 'Oferta wysłana',
        CHANGED: 'Oferta zmieniona',
        AWARDED: 'Oferta wygrana',
        LOST: 'Oferta przegrana',
        CANCELED: 'Przetarg unieważniony',
        WITHDRAWN: 'Oferta wycofana',
    };

    static OfferBidProcedure = {
        REQUEST_FOR_QUOTATION: 'Zapytanie ofertowe',
        TENDER_PL: 'Przetarg BZP',
        TENDER_EU: 'Przetarg DUUE',
    };

    static OfferForm = {
        EMAIL: 'Email',
        PLATFORM: 'Platforma',
        PAPER: 'Papier',
    };

    static ClientNeedStatus = {
        URGENT: 'Pilne',
        IMPORTANT: 'Ważne',
        NICE_TO_HAVE: 'Miło by było',
        FOR_LATER: 'Na później',
        NOT_ACTUAL: 'Nie aktualne',
    };

    static ApplicationCallStatus = {
        UNKOWN: 'Nieznany',
        SCHEDULED: 'Zaplanowany',
        OPEN: 'Otwarty',
        CLOSED: 'Zamknięty',
    };

    static ElementsNeededForApplication = {
        EIA_DECISION: 'DUŚ',
        PFU: 'PFU',
        BUILDING_PERMIT: 'Pozwolenie na budowę',
        DECISION: 'Decyzja lokalizacyjna',
        MPZPT: 'MPZPT',
    };

    static LetterEventType = {
        CREATED: 'CREATED',
        TO_CORRECT: 'TO_CORRECT',
        CHANGED: 'CHANGED',
        APPROVED: 'APPROVED',
        SENT: 'SENT',
        CANCELED: 'CANCELED',
    } as const;

    static LetterStatus = {
        CREATED: 'CREATED',
        TO_CORRECT: 'TO_CORRECT',
        CHANGED: 'CHANGED',
        APPROVED: 'APPROVED',
        SENT: 'SENT',
        CANCELED: 'CANCELED',
    } as const;

    static LetterForm = {
        EMAIL: 'Email',
        PAPER: 'Papier',
    };
}
