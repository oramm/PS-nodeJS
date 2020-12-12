

import mysql from 'mysql';
export default class Setup {
    static conn: mysql.Pool = mysql.createPool({
        host: 'envi-konsulting.kylos.pl',
        user: 'envikons_myEnvi',
        password: '7Fj2*j!lA3t@#D',
        database: 'envikons_myEnvi',
        multipleStatements: true
    });

    static Gd = {
        meetingProtocoTemlateId: '1B5D2ZUkPgNft0-0JZCtkxSk8eAZa91DnwQY8Bbln9Bo'

    }/*
    conn.connect(function (err: any) {
        if (err) throw err;
        console.log("Database Connected!");
    });
    */
}