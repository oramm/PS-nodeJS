import { ImapFlowOptions, Logger } from 'imapflow';
import mysql from 'mysql2/promise';

export default class Setup {
    /**
     * Pula polaczen MySQL. Budzet calego konta to `max_user_connections = 20`,
     * dzielony z dobowym dynem Schedulera, faza release i sesjami administracyjnymi.
     *
     * `maxIdle` MUSI byc mniejsze od `connectionLimit` - inaczej mysql2 w ogole nie
     * uruchamia zbieracza bezczynnych polaczen (base/pool.js:29), a polaczenie raz
     * otwarte lezy zajete az do `wait_timeout` serwera, czyli 8 godzin. Dyno Eco
     * usypia i budzi sie pod nowym adresem, wiec kazda taka sierota zjada slot
     * konta do nastepnego poranka.
     *
     * `idleTimeout` krotszy od cyklu drainerow (60 s) sprowadza pule do zera miedzy
     * cyklami, wiec zasypiajace dyno zostawia najwyzej jedna sierote zamiast
     * kompletu polaczen. Kosztem jest jeden handshake na minute w spoczynku.
     *
     * `queueLimit` ogranicza DLUGOSC kolejki, nie czas czekania - mysql2 3.14.5 nie
     * ma opcji limitujacej czas oczekiwania na polaczenie. Dotychczasowe `0` jest
     * falsy, wiec kolejka rosla bez konca i zadanie wisialo, az Heroku ubil je po
     * 30 s. Setka stoi nad realnym pikiem (6 osob x 12 zadan Dashboardu), a blad
     * "Queue limit reached." nie jest bledem polaczenia, wiec nie wywoluje resetPool.
     */
    static get dbConfig(): mysql.PoolOptions {
        const envInt = (raw: string | undefined, fallback: number): number => {
            const trimmed = raw?.trim();
            if (!trimmed) return fallback;
            const value = Number(trimmed);
            return Number.isInteger(value) && value >= 0 ? value : fallback;
        };
        const connectionLimit = Math.max(
            2,
            envInt(process.env.DB_CONNECTION_LIMIT, 8)
        );
        const maxIdle = Math.max(
            1,
            Math.min(
                envInt(process.env.DB_MAX_IDLE, connectionLimit - 1),
                connectionLimit - 1
            )
        );
        const idleTimeout = Math.max(
            1000,
            envInt(process.env.DB_IDLE_TIMEOUT_MS, 45000)
        );

        return {
            connectionLimit,
            maxIdle,
            idleTimeout,
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: process.env.DB_MULTIPLE_STATEMENTS !== 'false',
            timezone: '+00:00',
            waitForConnections: true,
            queueLimit: envInt(process.env.DB_QUEUE_LIMIT, 100),
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            connectTimeout: 10000,
        };
    }

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
        rootFolderId: '0AFGVqb32NbAaUk9PVA',//1C_wMgQJtzsFmgsmHp7Dr_F1VJx4v1mjo
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

            // Kolumny pierwszego wiersza - podstawowe dane
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

            // Kolumny pierwszego wiersza - czasy i podsumowania
            actualTimeColName: 'Czas rzeczywisty',
            differenceColName: 'Różnica',
            timesSummaryColName: '#TimesSummary',
            timesColName: '#Times',
            modeColName: 'tryb',
            executionColName: 'Wykonanie', // dla dokumentacji, choć nie używane w setHeaders

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
            /**drugi wiersz */
            remainingColName: 'POZOSTAŁO',

            /**trzeci wiersz i dalej - opisy podsumowań*/
            availableTimeColName: 'Cz. dost. og.',
            assignedColName: 'Przypisano',
            meetingsColName: 'spotk',
            totalColName: 'Razem',
            workTimeColName: 'CZ. PRACY',
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

    /** Konfiguracja scrumboarda w aplikacji webowej (następca arkusza ScrumSheet) */
    static ScrumBoard = {
        /** folder GD na kopie raportów scrumboarda */
        reportFolderId: '1W1uWZj3Oje6h-PGYYJieXMSjAbihY-rS',
        /** OurId kontraktu-koszyka "Oferty" (stały biznesowo, niezależny od id środowiska) */
        offersBucketContractOurId: 'ENV.OFE.01',
        /** Nazwa typu sprawy-koszyka utworzonego w migracji 003 (unikalny per kamień) */
        bucketCaseTypeName: 'Zadania',
    };

    /** Flaga wygaszania starej synchronizacji z arkuszem ScrumSheet.
     *  Domyślnie włączona; ustaw SCRUM_SHEET_SYNC_ENABLED=false aby wyłączyć. */
    static get scrumSheetSyncEnabled(): boolean {
        return process.env.SCRUM_SHEET_SYNC_ENABLED !== 'false';
    }

    static CaseTypes = {
        SECURITY_GUARANTEE: 99,
    };

    static MilestoneTypes = {
        OURCONTRACT_ADMINISTRATION: 1,
        DESIGN_SUPERVISION: 6,
        OFFER_SUBMISSION: 51,
        OFFER_EVALUATION: 52,
    };

    /** Rejestr „Dokumentacja zatwierdzona” w kamieniu projektowanie-nadzór. */
    static ApprovedDocumentation = {
        folderName: '04 Dokumentacja zatwierdzona',
        sheetName: 'Rejestr dokumentacji zatwierdzonej',
        // Kolejność kolumn = kolejność w wierszu w ApprovedDocsController.registerLetter
        header: [
            'Lp',
            'Data',
            'Rodzaj',
            'Nr pisma zatwierdzającego',
            'Dotyczy',
            'Sprawa',
            'Link',
        ],
        // Podpowiedzi w kolumnie „Rodzaj” (dropdown, ale można wpisać inne).
        rodzajOptions: ['pismo', 'mail'],
    };

    /**
     * Arkusze zaliczek i rejestru listów.
     *
     * Identyfikatory wyłącznie z env — w dev wskazują kopie, w produkcji pliki żywe,
     * więc przejście na produkcję nie wymaga zmiany w kodzie. To jedyne zabezpieczenie
     * przed zapisem w niewłaściwy plik: zapis jest zawsze rzeczywisty.
     */
    static PettyCash = {
        get spreadsheetId(): string {
            return process.env.PETTY_CASH_SPREADSHEET_ID ?? '';
        },
        get registerSpreadsheetId(): string {
            return process.env.POSTAL_REGISTER_SPREADSHEET_ID ?? '';
        },
        /**
         * Szablon linku do śledzenia przesyłki. `{number}` zastępujemy pełnym numerem
         * w postaci, jakiej oczekuje wyszukiwarka Poczty: 20 znaków bez nawiasów,
         * czyli `00` + 18 cyfr SSCC.
         *
         * Trzymane w env, bo adresu nie da się potwierdzić z dokumentacji, a błędny link
         * w arkuszu księgowym jest gorszy niż jego brak. Pusta wartość = numer zapisany
         * zwykłym tekstem, dokładnie jak dotąd.
         */
        get trackingUrlTemplate(): string {
            return process.env.POSTAL_TRACKING_URL_TEMPLATE ?? '';
        },
    };

    static InvoiceStatus = {
        FOR_LATER: 'Na później',
        TO_DO: 'Do zrobienia',
        DONE: 'Zrobiona',
        SENT: 'Wysłana',
        READY_FOR_KSEF: 'Gotowa do wysłania KSeF',
        SENT_TO_KSEF: 'Wysłana do KSeF',
        KSEF_ERROR: 'Odrzucona przez KSeF',
        PAID: 'Zapłacona',
        TO_CORRECT: 'Do korekty',
        WITHDRAWN: 'Wycofana',
        CORRECTED: 'Skorygowana',
    };

    /**
     * Kanoniczne grupy statusów faktur używane do liczenia wartości
     * rozliczenia kontraktu. Jedno źródło prawdy dla:
     * - ContractsSettlementController (szczegóły/rozliczenie kontraktu),
     * - ContractsController i ContractRepository (lista kontraktów, dashboard).
     */
    static InvoiceStatusGroups = {
        /**
         * Faktury faktycznie wystawione / będące w obiegu (rozliczone).
         * Wysłane, wysłane do KSeF, zapłacone oraz skorygowane
         * (skorygowana to nadal faktura obiegowa).
         */
        ISSUED: [
            Setup.InvoiceStatus.SENT,
            Setup.InvoiceStatus.SENT_TO_KSEF,
            Setup.InvoiceStatus.PAID,
            Setup.InvoiceStatus.CORRECTED,
        ],
        /**
         * Faktury zarejestrowane w systemie (zaplanowane lub wystawione).
         * Wszystkie statusy poza wycofanymi (WITHDRAWN) i odrzuconymi
         * przez KSeF (KSEF_ERROR), które nie stanowią zobowiązania.
         */
        REGISTERED: [
            Setup.InvoiceStatus.FOR_LATER,
            Setup.InvoiceStatus.TO_DO,
            Setup.InvoiceStatus.DONE,
            Setup.InvoiceStatus.READY_FOR_KSEF,
            Setup.InvoiceStatus.SENT,
            Setup.InvoiceStatus.SENT_TO_KSEF,
            Setup.InvoiceStatus.PAID,
            Setup.InvoiceStatus.TO_CORRECT,
            Setup.InvoiceStatus.CORRECTED,
        ],
    };

    /** Buduje listę statusów do klauzuli SQL IN(...) z grupy statusów. */
    static invoiceStatusSqlList(group: string[]): string {
        return group.map((status) => `'${status}'`).join(', ');
    }

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

    static MilestoneStatus = {
        NOT_STARTED: 'Nie rozpoczęty',
        IN_PROGRESS: 'W trakcie',
        FINISHED: 'Zakończony',
        ARCHIVAL: 'Archiwalny',
    };

    static CaseStatus = {
        FOR_LATER: 'Na zaś',
        IN_PROGRESS: 'W trakcie',
        CLOSED: 'Zamknięta',
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

    /**
     * Konfiguracja KSeF - tylko surowe wartości z .env
     * Logika walidacji i budowania URL jest w KsefService
     *
     * GETTER zamiast statycznej właściwości — wartości env muszą być
     * odczytywane lazily, po loadEnv(), a nie w momencie ładowania modułu
     * (CommonJS hoistuje require() przed wywołaniem loadEnv()).
     *
     * Format w .env:
     *   KSEF_ENVIRONMENT="test"           # test | production
     *   KSEF_API_BASE_URL="https://..."   # opcjonalny override URL API
     *   KSEF_NIP="1234567890"            # 10 cyfr
     *   KSEF_TOKEN="..."                 # Token z KSeF
     *   KSEF_SELLER_NAME=
     *   KSEF_SELLER_STREET=
     *   KSEF_SELLER_CITY=
     *   KSEF_SELLER_POSTAL_CODE=
     *   KSEF_SELLER_BANK_ACCOUNT=
     *   KSEF_SELLER_BANK_NAME=
     */
    static get KSeF() {
        return {
            /** Środowisko: 'test' | 'production' */
            environment: (process.env.KSEF_ENVIRONMENT || 'test') as
                | 'test'
                | 'production',
            /** Opcjonalny override URL API KSeF */
            apiBaseUrl: process.env.KSEF_API_BASE_URL,
            /** NIP firmy (10 cyfr) */
            nip: process.env.KSEF_NIP,
            /** Token autoryzacyjny KSeF */
            token: process.env.KSEF_TOKEN,
            /** Dane sprzedawcy - WYMAGANE w .env */
            seller: {
                name: process.env.KSEF_SELLER_NAME,
                street: process.env.KSEF_SELLER_STREET,
                city: process.env.KSEF_SELLER_CITY,
                postalCode: process.env.KSEF_SELLER_POSTAL_CODE,
                bankAccount: process.env.KSEF_SELLER_BANK_ACCOUNT,
                bankName: process.env.KSEF_SELLER_BANK_NAME,
            },
        };
    }

    /**
     * Konfiguracja integracji push PS ENVI -> AQM (WS10).
     * Tylko surowe wartości z .env — odczytywane lazily (getter), po loadEnv().
     * Sekrety (token) NIE trafiają do SB ani repo — tylko nazwy env (.env.example).
     *
     * Format w .env:
     *   AQM_SYNC_BASE_URL="https://model3.e-aquamatic.pl"   # baza URL AQM
     *   AQM_SYNC_TOKEN="..."                                 # Bearer service-token (sekret)
     *   AQM_SYNC_CONTRACT_TYPE_IDS="10"                      # allowlist id typów (CSV)
     *   AQM_SYNC_DRAIN_INTERVAL_MS="60000"                   # interwał drainera outbox (ms); 0 = wyłączony
     */
    static get AqmSync() {
        const rawTypeIds = process.env.AQM_SYNC_CONTRACT_TYPE_IDS ?? '10';
        const contractTypeIds = rawTypeIds
            .split(',')
            .map((part) => parseInt(part.trim(), 10))
            .filter((id) => Number.isInteger(id));
        const rawDrainInterval = Number(
            process.env.AQM_SYNC_DRAIN_INTERVAL_MS ?? '60000'
        );
        const drainIntervalMs =
            Number.isFinite(rawDrainInterval) && rawDrainInterval >= 0
                ? rawDrainInterval
                : 60000;
        return {
            baseUrl: process.env.AQM_SYNC_BASE_URL,
            token: process.env.AQM_SYNC_TOKEN,
            contractTypeIds,
            drainIntervalMs,
        };
    }

    /**
     * Konfiguracja integracji sync PS ENVI -> FIDman (SYNC-P1).
     * Tylko surowe wartości z .env — odczytywane lazily (getter), po loadEnv().
     * Sekrety (token) NIE trafiają do SB ani repo — tylko nazwy env (.env.example).
     *
     * Format w .env:
     *   FIDMAN_SYNC_BASE_URL="https://nowy.fidman.eu"     # baza URL FIDman
     *   FIDMAN_SYNC_TOKEN="..."                            # Bearer service-token (sekret)
     *   FIDMAN_SYNC_CONTRACT_TYPE_IDS="3,4"               # allowlist id typów (CSV)
     *   FIDMAN_SYNC_DRAIN_INTERVAL_MS="60000"             # interwał drainera outbox (ms); 0 = wyłączony
     */
    static get FidmanSync() {
        const rawTypeIds = process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS ?? '3,4';
        const contractTypeIds = rawTypeIds
            .split(',')
            .map((part) => parseInt(part.trim(), 10))
            .filter((id) => Number.isInteger(id));
        const rawDrainInterval = Number(
            process.env.FIDMAN_SYNC_DRAIN_INTERVAL_MS ?? '60000'
        );
        const drainIntervalMs =
            Number.isFinite(rawDrainInterval) && rawDrainInterval >= 0
                ? rawDrainInterval
                : 60000;
        return {
            baseUrl: process.env.FIDMAN_SYNC_BASE_URL,
            token: process.env.FIDMAN_SYNC_TOKEN,
            contractTypeIds,
            drainIntervalMs,
        };
    }

    /**
     * Konfiguracja kontroli „czy wgrano umowę na Dysk".
     * Odczytywana lazily (getter), po loadEnv(). Bez sekretów — kontrola korzysta
     * z REFRESH_TOKEN przez ToolsGapi.getBackgroundAuth().
     *
     * Format w .env:
     *   CONTRACT_DOCUMENT_CASE_TYPE_IDS="85,75"   # id typów spraw trzymających umowę (CSV)
     *   CONTRACT_DOCUMENT_CHECK_BATCH_LIMIT="50"  # ile umów na jedno wywołanie endpointu
     *
     * Typy spraw siedzą w env, a NIE na sztywno w kodzie, z tego samego powodu co
     * FIDMAN_SYNC_CONTRACT_TYPE_IDS: słownik CaseTypes jest danymi i może się zmienić bez
     * deployu. Zaszycie ich w module powtórzyłoby błąd APPROVED_DOCS_CONTRACT_TYPE_IDS
     * z frontu, który repo wskazuje jako precedens kruchości.
     *
     * Domyślne 85 („Umowa i zmiany" — umowy ENVI) i 75 („Umowa" — umowy wykonawców)
     * zmierzone na bazie: to jedyne typy spraw, pod którymi realnie leży plik umowy.
     *
     * Limit partii NIE jest optymalizacją, tylko wymogiem: Heroku ucina żądanie HTTP po
     * 30 sekundach, a pełny przebieg po ~620 umowach jest zbyt blisko tej granicy.
     */
    static get ContractDocuments() {
        const rawTypeIds =
            process.env.CONTRACT_DOCUMENT_CASE_TYPE_IDS ?? '85,75';
        const caseTypeIds = rawTypeIds
            .split(',')
            .map((part) => parseInt(part.trim(), 10))
            .filter((id) => Number.isInteger(id));
        const rawBatchLimit = Number(
            process.env.CONTRACT_DOCUMENT_CHECK_BATCH_LIMIT ?? '50'
        );
        const batchLimit =
            Number.isInteger(rawBatchLimit) && rawBatchLimit > 0
                ? rawBatchLimit
                : 50;
        return { caseTypeIds, batchLimit };
    }

    /**
     * Konfiguracja integracji lookup PS ENVI -> GUS BIR (NIP-G1).
     * Tylko surowa wartość z .env — odczytywana lazily (getter), po loadEnv().
     * Sekret (klucz) NIE trafia do SB ani repo — tylko nazwa env (.env.example).
     * BLOCKED do gate G-N1: bez GUS_BIR_KEY endpoint /entities/lookup-nip
     * odpowiada 503 (fail-closed, lookup jest opcjonalnym przyciskiem).
     *
     * Format w .env:
     *   GUS_BIR_KEY="..."   # klucz produkcyjny GUS BIR (sekret); brak = 503
     */
    static get GusBir() {
        return {
            key: process.env.GUS_BIR_KEY,
        };
    }

    static get Bank() {
        return {
            matching: {
                autoThreshold: Number(process.env.BANK_MATCH_AUTO_THRESHOLD ?? 0.85),
                proposeThreshold: Number(process.env.BANK_MATCH_PROPOSE_THRESHOLD ?? 0.5),
                amountToleranceGrosze: Number(process.env.BANK_AMOUNT_TOLERANCE_GROSZE ?? 1),
            },
            dateWindowDays: Number(process.env.BANK_DATE_WINDOW_DAYS ?? 60),
        };
    }

    static x: 'sss' | 'ddd';
}
