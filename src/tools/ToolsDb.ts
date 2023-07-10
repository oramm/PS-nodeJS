import { ResultSetHeader } from 'mysql2';
import mysql from 'mysql2/promise';
import Setup from '../setup/Setup';
import Tools from './Tools';
import ToolsDate from './ToolsDate';

export default class ToolsDb {
    static pool: mysql.Pool = mysql.createPool(Setup.dbConfig).pool.promise();

    static async getQueryCallbackAsync(sql: string) {
        try {
            return (await this.pool.query(sql))[0];
        } catch (error) {
            console.log(sql);
            throw (error);
        }
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
        let string = '';
        if (!sqlString) return string;
        if (sqlString === 'LAST_INSERT_ID()')
            return sqlString;

        return sqlString
            .replace(/\\'/gi, "'")
            .replace(/\\"/gi, '"')
            .replace(/\\%/gi, '%');
    }
    /** dodaje do bazy obiekt 
     * @argument object może mieć atrybut '_isIdNonIncrement' - wtedy id jest trakrowany jak normalne pole
     * */
    static async addInDb(tableName: string, object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection = externalConn || await this.pool.getConnection();
        let stmt: { string: string; values: any[] } | undefined;

        try {
            // Remove tmp_id from the client
            if (!object._isIdNonIncrement) delete object.id;

            stmt = this.dynamicInsertPreparedStmt(tableName, object);
            const result = await conn.execute(stmt.string, stmt.values);
            object.id = (<any>result)[0].insertId;

            if (!isPartOfTransaction) await conn.commit();

            return object;
        } catch (e) {
            if (!isPartOfTransaction) await conn.rollback();

            console.error('Error occurred during statement execution: ', e);
            if (stmt) {
                console.error('Statement with error: ', stmt);
            } else {
                console.error('Statement was not defined.');
            }

            throw e;
        } finally {
            if (!externalConn && !isPartOfTransaction) conn.release();
        }
    }


    //edytuje obiekt w bazie
    static async editInDb(tableName: string, object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean): Promise<any> {
        const conn: mysql.PoolConnection = externalConn || await this.pool.getConnection();
        let stmt: { string: string, values: any[] } | undefined;

        try {
            stmt = this.dynamicUpdatePreparedStmt(tableName, object);
            const result = await conn.execute(stmt.string, stmt.values);
            const newObject = result[0];

            if (!isPartOfTransaction) await conn.commit();

            return newObject;
        } catch (e) {
            if (!isPartOfTransaction) await conn.rollback();

            console.error('Error occurred during statement execution: ', e);
            if (stmt) {
                console.error('Statement with error: ', stmt);
            } else {
                console.error('Statement was not defined.');
            }

            throw e;
        } finally {
            if (!externalConn && !isPartOfTransaction) conn.release();
        }
    }

    static async deleteFromDb(tableName: string, object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection = externalConn || await this.pool.getConnection();
        try {
            await conn.execute(`DELETE FROM ${tableName} WHERE Id =?`, [object.id]);
            if (!isPartOfTransaction) await conn.commit();
            console.log(`object deleted from ${tableName}`);
            return object;
        } catch (e) {
            if (!isPartOfTransaction) await conn.rollback();
            console.log(`stmt with Error: DELETE FROM ${tableName} WHERE Id = ${object.id};`);
            throw e;
        } finally {
            if (!isPartOfTransaction && !externalConn) conn.release();
        }
    }

    static async executePreparedStmt(sql: string, params: any[], object: any, externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn: mysql.PoolConnection = externalConn || await this.pool.getConnection();
        try {
            params = params.map(item => this.prepareValueToPreparedStmtSql(item));
            await conn.execute(sql, params);
            if (!isPartOfTransaction) await conn.commit();
            return object;
        } catch (e) {
            if (!isPartOfTransaction && !externalConn) await conn.rollback();
            throw e;
        }
        finally {
            if (!isPartOfTransaction && !externalConn) conn.release();
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
                //console.log(key + ' = ' + object[key]);
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
