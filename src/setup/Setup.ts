export default class Setup {
    static dbConfig = {
        connectionLimit: 10,
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    };

    static Gd = {
        rootFolderId: '1C_wMgQJtzsFmgsmHp7Dr_F1VJx4v1mjo',
        meetingProtocoTemlateId: '1B5D2ZUkPgNft0-0JZCtkxSk8eAZa91DnwQY8Bbln9Bo',
        offersRootFolderId: '0B2pP2WpBR244WDgzT0RHcmFCMW8',
    };

    static ScrumSheet = {
        GdId: '13j9WZTEJfdjQThxzqd_aQM_1CAnqQPrfQ26v7r4wmBE',
        Planning: {
            id: 830733384,
            firstDataRow: 3,
            name: 'planowanie',
            personIdColName: "Osoba",
            workingDaysColName: "liczba dni pracy",
            workingHoursColName: "liczba godzin pracy",
            freeHoursColName: "odbierane godziny",
            hoursAvailableColName: "liczba godzin w tygodniu",
            /**drugi wiersz */
            planningMeetingColName: "planowanie",
            /**drugi wiersz */
            retrospectionMeetingColName: "spotkanie końcowe",
            /**drugi wiersz */
            extraMeetingsColName: "dodatkowe spotkania",

        },
        CurrentSprint: {
            id: 223354508,
            firstDataRow: 4,
            name: "aktualny sprint",
            projectIdColName: "Id projektu",
            contractDbIdColName: "dbId kontraktu",
            contractOurIdColName: "ourId kontraktu",
            milestoneIdColName: "Id kamienia milowego",
            caseTypeIdColName: "Id typu sprawy",
            caseIdColName: "Id sprawy",
            taskIdColName: "Id zadania",
            rowStatusColName: "#ImportStatus",
            contractNumberColName: "Nr kontraktu na roboty/ dostawy",
            milestoneNameColName: "Typ i nazwa kamienia milowego",

            caseTypeColName: "Typ sprawy I numer sprawy",
            caseNameColName: "Nazwa sprawy",
            taskNameColName: "Nazwa zadania",
            taskDeadlineColName: "Deadline",
            taskEstimatedTimeColName: "szac. czas",
            taskStatusColName: "Status",
            taskOwnerIdColName: "Id właściciela",
            taskOwnerNameColName: "Kto",
            /**drugi wiersz */
            monColName: "PON.",
            /**drugi wiersz */
            tueColName: "WTO.",
            /**drugi wiersz */
            wedColName: "SR.",
            /**drugi wiersz */
            thuColName: "CZW.",
            /**drugi wiersz */
            friColName: "PT.",
            /**drugi wiersz */
            sprintSumColName: "Razem",
            /**drugi wiersz */
            sprintDiffColName: "Różnica",
            modeColName: 'tryb',

            timesSummaryColName: "#TimesSummary",
            /**Formuły z czasami dla osób*/
            timesColName: "#Times",

        },
        Data: {
            id: 2143933154,
            firstDataRow: 2,
            name: 'dane',
            personIdColName: "OwnerId",
            personNameColName: "lista osób - zasoby",
            caseIdColName: "CaseId",
            caseTypeIdColName: "CaseTypeId",
            case_milestoneIdColName: "Case_MilestoneId",
            caseNameColName: "CaseName",
            caseGdFolderIdColName: "Case_gdFolderId"
        }
    }

    static CaseTypes = {
        SECURITY_GUARANTEE: 99,
    }

    static MilestoneTypes = {
        OURCONTRACT_ADMINISTRATION: 1,
    }

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
    }

    static TaskStatus = {
        BACKLOG: 'Backlog',
        NOT_STARTED: 'Nie rozpoczęty',
        IN_PROGRESS: 'W trakcie',
        TO_CORRECT: 'Do poprawy',
        AWAITING_RESPONSE: 'Oczekiwanie na odpowiedź',
        DONE: 'Zrobione',
    };

    static OfferStatus = {
        TO_DO: 'Do złożenia',
        DONE: 'Czekamy na wynik',
        AWARDED: 'Wygrana',
        LOST: 'Przegrana',
        WITHDRAWN: 'Wycofana',
        NOT_INTERESTED: 'Nie składamy',
    };

    static OfferBidProcedure = {
        X: 'Zapytanie ofertowe',
        TENDER_PL: 'Przetarg BZP',
        TENDER_EU: 'Przetarg DUUE',
    };

    static OfferForm = {
        EMAIL: 'Email',
        PLATFORM: 'Platforma',
        PAPER: 'Papier',
    };
}