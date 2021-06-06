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
        meetingProtocoTemlateId: '1B5D2ZUkPgNft0-0JZCtkxSk8eAZa91DnwQY8Bbln9Bo',
    };

    static Sheets = {
        scrumSheetId: '13j9WZTEJfdjQThxzqd_aQM_1CAnqQPrfQ26v7r4wmBE',
        scrumSheetFirstDataRow: 4,
        scrumSheetName: "aktualny sprint",
        scrumSheetDataName: 'dane'
    }
}
