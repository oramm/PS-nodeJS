import { ResultSetHeader } from 'mysql2';
import mysql from 'mysql2/promise';
import Setup from '../setup/Setup';
import Tools from './Tools';
import ToolsDate from './ToolsDate';

export default class ToolsDb {
    static pool: mysql.Pool = mysql.createPool(Setup.dbConfig);
    static async getQueryCallbackAsync(sql: string) {
        try {
            return (await this.pool.query(sql))[0];
        } catch (error) {
            console.log(error);
            throw error;
        }

    }

    static async getQueryCallbackAsyncOld(sql: string) {
        return new Promise((resolve, reject) => {
            this.pool.query(sql, (err: any, rows: any[], fields: any) => {
                if (err) {
                    console.log('Failed to query: ' + err.message);
                    reject(err);
                }
                resolve(rows);
            });
        });
    }

    static prepareValueToSql(value: any) {
        if (value !== undefined && value !== null) {
            if (typeof value === 'number' || typeof value === 'boolean')
                return value;
            var date = value.split('-');
            if (value.length == 10 && date.length == 3 && date[2].length == 4)
                //czy mamy datę
                return "'" + ToolsDate.dateJsToSql(value) + "'";
            else return "'" + this.stringToSql(value) + "'";
        } else if (value === '') return '""';
        else return 'null';
    }

    static prepareValueToPreparedStmtSql(value: any) {
        //"startDate":"12-06-2018"
        if (value === null || value === '' || typeof value === 'number' || typeof value === 'boolean')
            return value;
        if (value === undefined)
            return null;
        if (typeof value === 'string') {
            if (ToolsDate.isStringADate(value))
                //czy mamy datę
                return ToolsDate.dateDMYtoYMD(value);
            else return this.stringToSql(value);
        }
        if (ToolsDate.isValidDate(value))
            return ToolsDate.dateJsToSql(value);
    }

    static stringToSql(string: string): string {
        var sqlString = '';
        if (string !== 'LAST_INSERT_ID()') {
            sqlString = string.replace(/\'/gi, "\\'");
            sqlString = sqlString.replace(/\"/gi, '\\"');
            sqlString = sqlString.replace(/\%/gi, '\\%');
            //sqlString = string.replace(/\_/gi, '\\_');
        }
        return sqlString;
    }

    static sqlToString(sqlString: string): string {
        var string = '';
        if (sqlString && string !== 'LAST_INSERT_ID()') {
            string = sqlString.replace(/\\'/gi, "'");
            string = string.replace(/\\"/gi, '"');
            string = string.replace(/\\%/gi, '%');
            //string = sqlString.replace(/\\_/gi, '\_');
        }
        return string;
    }
    /** dodaje do bazy obiekt 
     * @argument object może mieć atrybut '_isIdNonIncrement' - wtedy id jest trakrowany jak normalne pole
     * */
    static async addInDb(tableName: string, object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection = externalConn ? externalConn : await this.pool.getConnection();
        try {
            //od klienta przychodzi tmp_id - trzeba się go pozbyć
            if (!object._isIdNonIncrement)
                delete object.id;
            const stmt = await this.dynamicInsertPreparedStmt(tableName, object);
            const result = await conn.execute(stmt.string, stmt.values);
            object.id = (<any>result)[0].insertId;

            if (!isPartOfTransaction) await conn.commit();

            return object;
        } catch (e) {
            if (!isPartOfTransaction) await conn.rollback();
            console.log(e);
            throw e;
        } finally {
            if (!externalConn && !isPartOfTransaction) await conn.release();
        }
    }

    //edytuje obiekt w bazie
    static async editInDb(tableName: string, object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection | mysql.Pool = externalConn ? externalConn : await this.pool.getConnection();

        try {
            var stmt = await this.dynamicUpdatePreparedStmt(tableName, object);
            let newObject: any;
            newObject = (await conn.execute(stmt.string, stmt.values))[0];
            if (!isPartOfTransaction) await conn.commit();
            return newObject;
        } catch (e) {
            if (!isPartOfTransaction) await conn.rollback();
            console.log(e);
            throw e;
        }
    }

    static async deleteFromDb(tableName: string, object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection | mysql.Pool = externalConn ? externalConn : await this.pool.getConnection();
        try {
            await conn.execute(`DELETE FROM ${tableName} WHERE Id =?`, [object.id]);
            if (!isPartOfTransaction) await conn.commit();
            console.log('object deleted');
            return object;
        } catch (e) {
            if (!isPartOfTransaction) await conn.rollback();
            console.log(e);
            throw e;
        }
    }

    static async executePreparedStmt(sql: string, params: any[], object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection | mysql.Pool = externalConn ? externalConn : this.pool;
        try {
            params = params.map(item => this.prepareValueToPreparedStmtSql(item));
            await conn.execute(sql, params);
            return object;
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * * * * * * * * Prepared Statement
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    //tworzy String prepared Statement na podstawie atrybutuów objektu
    private static dynamicUpdatePreparedStmt(tableName: string, object: any) {
        if (!object.id)
            throw new Error('Edytowany obiekt musi mieć atrybut Id!');

        let keys: string[] = Object.keys(object);
        let stmt: { string: string, values: any[] } = {
            string: 'UPDATE ' + tableName + ' SET ',
            values: this.processColls('UPDATE', keys, object)
        };
        for (const key of keys) {
            if (this.isValidDbAttribute(key, object)) {
                //polami w Db sa atrybuty bez _ i z dopiskiem LocalData (jest on usuwany przed wysłąniem SQL do db)
                const end = key.indexOf('LocalData')
                let keyWithoutLocalData = key;
                if (end > 0) {
                    keyWithoutLocalData = key.substring(0, end);
                }
                stmt.string += Tools.capitalizeFirstLetter(keyWithoutLocalData) + '=?, ';
            }
        }
        //obetnij ostatni przecinek
        stmt.string = stmt.string.substring(0, stmt.string.length - 2);
        stmt.string += ' WHERE Id = ?';
        console.log('stmt: %o', stmt);

        return stmt;
    }

    private static dynamicInsertPreparedStmt(tableName: string, object: any) {
        const keys: string[] = Object.keys(object);
        //INSERT INTO tableName (Name, Description, MilestoneId) values (?, ?, ?)
        const stmt: { string: string, values: any[] } = {
            string: `INSERT INTO ${tableName} (`,
            values: this.processColls('INSERT', keys, object)
        };

        let questionMarks = '';
        for (const key of keys) {
            if (this.isValidDbAttribute(key, object)) {
                stmt.string += Tools.capitalizeFirstLetter(key) + ', ';
                questionMarks += '?, ';
            }
        }
        //obetnij ostatni przecinek
        stmt.string = stmt.string.substring(0, stmt.string.length - 2);
        questionMarks = questionMarks.substring(0, questionMarks.length - 2);

        stmt.string += `) VALUES (${questionMarks})`;
        //console.log('object: %o', object);
        console.log('stmt: %o', stmt);

        return stmt;
    }
    /* 
     *jeśli nie chcę aby zmienna była zmieniana w DB trzeba: 
     *  dodać znak '_' albo 
     *  skasować parametr z obiektu: 'delete parametr'
    */
    private static isValidDbAttribute(key: string, object: any) {
        if (key === 'id')
            if (object._isIdNonIncrement)
                return true;
            else
                return (typeof object[key] === 'number') ? false : true;
        if (!key.includes('_') && object[key] !== undefined)
            return true;
        else return false;
    }

    private static processColls(queryType: 'UPDATE' | 'INSERT', cols: string[], object: any) {
        const values = [];
        for (const key of cols) {
            // jeśli nie chcę aby zmienna była zmieniana w DB trzeba dodać znak '_' albo skasować parametr z obiektu: 'delete parametr'
            if (this.isValidDbAttribute(key, object)) {
                console.log(key + ' = ' + object[key]);
                values.push(this.prepareValueToPreparedStmtSql(object[key]));
            }
        }
        if (queryType === 'UPDATE')
            values.push(object.id);
        return values;
    }
    /*
        async useTransaction() {
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await conn.query('...');
                await conn.query('...');
            });
        }
    */
    static async transaction(callback: (conn: mysql.PoolConnection) => Promise<any>) {
        const connection = await this.pool.getConnection();
        await connection.beginTransaction();

        try {
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (err) {

            await connection.rollback();
            // Throw the error again so others can catch it.
            throw err;
        } finally {
            connection.release();
        }
    }
}
