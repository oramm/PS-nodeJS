
import mysql from 'mysql';

const conn: mysql.Pool = mysql.createPool({
    host: 'envi-konsulting.kylos.pl',
    user: 'envikons_myEnvi',
    password: '7Fj2*j!lA3t@#D',
    database: 'envikons_myEnvi',
    multipleStatements: true
});

/*
conn.connect(function (err: any) {
    if (err) throw err;
    console.log("Database Connected!");
});
*/
export default conn;
