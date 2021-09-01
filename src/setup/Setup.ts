export default class Setup {
    static dbConfig = {
        host: 'envi-konsulting.kylos.pl',
        user: 'envikons_myEnvi',
        password: '7Fj2*j!lA3t@#D',
        database: 'envikons_myEnvi',
        multipleStatements: true,
    };
    static dbConfigTaryfy = {
        host: 'envi-konsulting.kylos.pl',
        user: 'envikons_taryfy',
        password: 'sUt6!ARpdvuq',
        database: 'envikons_taryfy',
        port: 3306,
        multipleStatements: true,
    };

    static Gd = {
        rootFolderId: '1C_wMgQJtzsFmgsmHp7Dr_F1VJx4v1mjo',
        meetingProtocoTemlateId: '1B5D2ZUkPgNft0-0JZCtkxSk8eAZa91DnwQY8Bbln9Bo',
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
            contractNumberColName: "Nr kontraktu na roboty/dostawy",
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
}
