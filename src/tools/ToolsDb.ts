import mysql, { ResultSetHeader } from 'mysql2/promise';
import Setup from '../setup/Setup';
import Tools from './Tools';
import ToolsDate from './ToolsDate';

export default class ToolsDb {
    static pool: mysql.Pool = mysql.createPool(Setup.dbConfig).pool.promise();

    static initialize() {
        // Ustawienie strefy czasowej dla każdego nowego połączenia
        ToolsDb.pool.on('connection', async (connection) => {
            connection.query("SET time_zone = '+00:00'");
        });
    }

    static async getPoolConnectionWithTimeout() {
        const promiseGetConnection = this.pool.getConnection();
        let timer: NodeJS.Timeout | null = null; // Dodajemy null jako wartość początkową

        const timeout = new Promise<mysql.PoolConnection>((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error('Timeout acquiring connection'));
            }, 10000);
        });

        try {
            const connection = await Promise.race([
                promiseGetConnection,
                timeout,
            ]);
            if (timer) clearTimeout(timer); // Sprawdzamy, czy timer jest ustawiony przed próbą czyszczenia
            return connection;
        } catch (error) {
            if (timer) clearTimeout(timer); // Podobnie jak wyżej
            throw error;
        }
    }

    static async getQueryCallbackAsync(
        sql: string,
        externalConn?: mysql.PoolConnection,
        params: any[] = []
    ) {
        const conn = externalConn || this.pool;
        try {
            return (await conn.query(sql, params))[0];
        } catch (error) {
            console.log(sql);
            throw error;
        }
    }

    static prepareValueToSql(value: any) {
        if (value !== undefined && value !== null) {
            if (typeof value === 'number' || typeof value === 'boolean')
                return value;
            const date = value.split('-');
            if (value.length == 10 && date.length == 3 && date[2].length == 4)
                //czy mamy datę
                return "'" + ToolsDate.dateJsToSql(value) + "'";
            else return "'" + this.stringToSql(value) + "'";
        } else if (value === '') return '""';
        else return 'null';
    }

    static prepareValueToPreparedStmtSql(value: any) {
        //"startDate":"12-06-2018"
        if (
            value === null ||
            value === '' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        )
            return value;
        if (value === undefined) return null;
        if (Tools.isValidJsonString(value)) return value;
        if (typeof value === 'string') {
            if (ToolsDate.isStringADate(value))
                //czy mamy datę
                return ToolsDate.dateDMYtoYMD(value);
            else return this.stringToSql(value);
        }
        if (ToolsDate.isValidDate(value)) return ToolsDate.dateJsToSql(value);
    }

    static stringToSql(string: string): string {
        let sqlString = '';
        if (string !== 'LAST_INSERT_ID()') {
            sqlString = string.replace(/\'/gi, "\\'");
            sqlString = sqlString.replace(/\"/gi, '\\"');
            //sqlString = sqlString.replace(/\%/gi, '\\%');
            //sqlString = string.replace(/\_/gi, '\\_');
        }
        return sqlString;
    }

    static sqlToString(sqlString: string): string {
        if (!sqlString) return '';
        if (sqlString === 'LAST_INSERT_ID()') return sqlString;

        // Usuwa backslash przed ', ", lub %
        return sqlString.replace(/\\(['"%])/g, '$1');
    }
    /** dodaje do bazy obiekt
     * @argument object może mieć atrybut '_isIdNonIncrement' - wtedy id jest trakrowany jak normalne pole
     * */
    static async addInDb(
        tableName: string,
        object: any,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Cannot be part of transaction without external connection!'
            );
        const conn: mysql.PoolConnection =
            externalConn || (await this.pool.getConnection());
        if (!externalConn)
            console.log(`addInDb ${tableName}:: conn opened `, conn.threadId);

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
            if (!externalConn) await conn.rollback();

            console.error('Error occurred during statement execution: ', e);
            if (stmt) {
                console.error('Statement with error: ', stmt);
            } else {
                console.error('Statement was not defined.');
            }

            throw e;
        } finally {
            if (!externalConn || !isPartOfTransaction) {
                conn.release();
                console.log(
                    `addInDb ${tableName}:: conn released`,
                    conn.threadId
                );
            }
        }
    }

    /**edytuje obiekt w bazie */
    static async editInDb(
        tableName: string,
        object: any,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        _fieldsToUpdate?: string[]
    ): Promise<any> {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Cannot be part of transaction without external connection!'
            );

        if (_fieldsToUpdate && _fieldsToUpdate.length === 0)
            throw new Error('No fields to update!');

        const conn: mysql.PoolConnection =
            externalConn || (await this.pool.getConnection());
        if (!externalConn)
            console.log(`editInDb ${tableName}:: conn opened `, conn.threadId);
        let stmt: { string: string; values: any[] } | undefined;

        try {
            stmt = this.dynamicUpdatePreparedStmt(
                tableName,
                object,
                _fieldsToUpdate
            );
            console.log(stmt.string);
            const result = await conn.execute(stmt.string, stmt.values);
            const newObject = result[0];

            if (!isPartOfTransaction) await conn.commit();

            return { ...object, ...newObject };
        } catch (e) {
            if (!externalConn) await conn.rollback();

            console.error('Error occurred during statement execution: ', e);
            if (stmt) {
                console.error('Statement with error: ', stmt);
            } else {
                console.error('Statement was not defined.');
            }

            throw e;
        } finally {
            if (!externalConn || !isPartOfTransaction) {
                conn.release();
                console.log(
                    `editInDb ${tableName}:: conn released`,
                    conn.threadId
                );
            }
        }
    }

    static async deleteFromDb(
        tableName: string,
        object: any,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Cannot be part of transaction without external connection!'
            );

        const conn: mysql.PoolConnection =
            externalConn || (await this.pool.getConnection());
        if (!externalConn)
            console.log(
                `deleteFromDb ${tableName}:: conn opened `,
                conn.threadId
            );
        try {
            await conn.execute(`DELETE FROM ${tableName} WHERE Id =?`, [
                object.id,
            ]);
            if (!isPartOfTransaction) await conn.commit();
            console.log(`object deleted from ${tableName}`);
            return object;
        } catch (e) {
            if (!externalConn) await conn.rollback();
            console.log(
                `stmt with Error: DELETE FROM ${tableName} WHERE Id = ${object.id};`
            );
            throw e;
        } finally {
            if (!isPartOfTransaction || !externalConn) {
                conn.release();
                console.log(
                    `deleteFromDb ${tableName}:: conn released`,
                    conn.threadId
                );
            }
        }
    }

    static async executePreparedStmt(
        sql: string,
        params: any[],
        object: any,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Cannot be part of transaction without external connection!'
            );

        const conn: mysql.PoolConnection =
            externalConn || (await this.pool.getConnection());
        if (!externalConn)
            console.log(`executePreparedStmt:: conn opened `, conn.threadId);
        try {
            params = params.map((item) =>
                this.prepareValueToPreparedStmtSql(item)
            );
            await conn.execute(sql, params);
            if (!isPartOfTransaction) await conn.commit();
            return object;
        } catch (e) {
            if (!externalConn) await conn.rollback();
            throw e;
        } finally {
            if (!isPartOfTransaction || !externalConn) {
                conn.release();
                console.log(
                    `executePreparedStmt:: conn released`,
                    conn.threadId
                );
            }
        }
    }

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * * * * * * * * Prepared Statement
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

    /**tworzy String prepared Statement na podstawie atrybutuów objektu*/
    private static dynamicUpdatePreparedStmt(
        tableName: string,
        object: any,
        _fieldsToUpdate?: string[]
    ) {
        if (!object.id)
            throw new Error('Edytowany obiekt musi mieć atrybut Id!');

        let keys: string[] = Object.keys(object);

        //Jeśli _fieldsToUpdate istnieje, przefiltruj klucze
        if (_fieldsToUpdate && _fieldsToUpdate.length) {
            keys = keys.filter((key) => _fieldsToUpdate.includes(key));
        }

        let stmt: { string: string; values: any[] } = {
            string: 'UPDATE ' + tableName + ' SET ',
            values: this.processColls('UPDATE', keys, object),
        };

        for (const key of keys) {
            if (this.isValidDbAttribute(key, object)) {
                //polami w Db sa atrybuty bez _ i z dopiskiem LocalData (jest on usuwany przed wysłąniem SQL do db)
                const end = key.indexOf('LocalData');
                let keyWithoutLocalData = key;
                if (end > 0) {
                    keyWithoutLocalData = key.substring(0, end);
                }
                stmt.string +=
                    '`' +
                    Tools.capitalizeFirstLetter(keyWithoutLocalData) +
                    '`=?, ';
            }
        }
        //obetnij ostatni przecinek
        stmt.string = stmt.string.substring(0, stmt.string.length - 2);
        stmt.string += ' WHERE Id = ?';
        console.log(stmt.string);
        return stmt;
    }

    private static dynamicInsertPreparedStmt(tableName: string, object: any) {
        const keys: string[] = Object.keys(object);
        //INSERT INTO tableName (Name, Description, MilestoneId) values (?, ?, ?)
        const stmt: { string: string; values: any[] } = {
            string: `INSERT INTO ${tableName} (`,
            values: this.processColls('INSERT', keys, object),
        };

        let questionMarks = '';
        for (const key of keys) {
            if (this.isValidDbAttribute(key, object)) {
                stmt.string += '`' + Tools.capitalizeFirstLetter(key) + '`, ';
                questionMarks += '?, ';
            }
        }
        //obetnij ostatni przecinek
        stmt.string = stmt.string.substring(0, stmt.string.length - 2);
        questionMarks = questionMarks.substring(0, questionMarks.length - 2);

        stmt.string += `) VALUES (${questionMarks})`;

        return stmt;
    }
    /** jeśli nie chcę aby zmienna była zmieniana w DB trzeba:
     *  dodać prafix  '_' albo
     *  skasować parametr z obiektu: 'delete parametr'
     */
    private static isValidDbAttribute(key: string, object: any) {
        if (key === 'id')
            if (object._isIdNonIncrement) return true;
            else return typeof object[key] === 'number' ? false : true;
        if (!key.startsWith('_') && object[key] !== undefined) return true;
        else return false;
    }

    private static processColls(
        queryType: 'UPDATE' | 'INSERT',
        cols: string[],
        object: any
    ) {
        const values = [];
        for (const key of cols) {
            // jeśli nie chcę aby zmienna była zmieniana w DB trzeba dodać znak '_' albo skasować parametr z obiektu: 'delete parametr'
            if (this.isValidDbAttribute(key, object)) {
                //console.log(key + ' = ' + object[key]);
                values.push(this.prepareValueToPreparedStmtSql(object[key]));
            }
        }
        if (queryType === 'UPDATE') values.push(object.id);
        return values;
    }
    /**
        async useTransaction() {
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await conn.query('...');
                await conn.query('...');
            });
        }
    */
    static async transaction<Type>(
        callback: (conn: mysql.PoolConnection) => Promise<any>,
        externalConn?: mysql.PoolConnection
    ) {
        const connection = externalConn || (await this.pool.getConnection());
        let transactionStarted = false;

        try {
            if (!externalConn) {
                console.log(
                    'transaction:: connection acquired',
                    connection.threadId
                );
                await connection.beginTransaction();
            }
            transactionStarted = true;
            const result = await callback(connection);
            if (!externalConn) {
                await connection.commit();
            }
            return result as Type;
        } catch (err) {
            if (transactionStarted && !externalConn) {
                await connection.rollback();
            }
            throw err;
        } finally {
            if (!externalConn) {
                connection.release();
                console.log(
                    'transaction:: connection released',
                    connection.threadId
                );
            }
        }
    }
    /** Wykonuje zapytanie SQL typu INSERT, UPDATE, DELETE */
    static async executeSQL(
        sql: string,
        params: any[] = [],
        externalConn?: mysql.PoolConnection
    ): Promise<ResultSetHeader> {
        const conn = externalConn || (await this.pool.getConnection());
        if (!externalConn)
            console.log('[DB] executeSQL:: conn acquired', conn.threadId);
        try {
            console.log('[DB] Wykonywanie SQL:', sql, 'Parametry:', params);
            const [result] = await conn.execute(sql, params);
            if (!externalConn) await conn.commit(); // Zatwierdzenie transakcji
            return result as ResultSetHeader;
        } catch (error) {
            if (!externalConn) await conn.rollback(); // Cofnięcie zmian w razie błędu
            console.error('[DB] Błąd w executeSQL:', error);
            console.log(sql);
            throw error;
        } finally {
            if (!externalConn) {
                conn.release();
                console.log('[DB] executeSQL:: conn released', conn.threadId);
            }
        }
    }

    /** Tworzy warunek WHERE z IN lub prostym porównaniem */
    static makeOrConditionFromValueOrArray(
        valueOrArray: string | string[] | number[] | undefined,
        tableName: string,
        fieldName: string
    ): string {
        if (!valueOrArray) return '1';

        if (
            typeof valueOrArray === 'string' ||
            typeof valueOrArray === 'number'
        ) {
            return mysql.format(`${tableName}.${fieldName} = ?`, [
                valueOrArray,
            ]);
        } else if (Array.isArray(valueOrArray) && valueOrArray.length > 0) {
            return mysql.format(`${tableName}.${fieldName} IN (?)`, [
                valueOrArray,
            ]);
        }

        // Dla pustej tablicy
        return '1';
    }

    /** W ramach pojedynczego warunku tworzy fragment WHERE gdzie elementy tablicy połączene przez OR */
    static makeOrConditionFromValueOrArray1(
        valueOrArray: string | string[] | any[] | undefined,
        tableName: string,
        tableFieldName: string,
        objectFieldName: string = ''
    ): string {
        if (!valueOrArray) return '1';
        if (typeof valueOrArray === 'string') {
            return mysql.format(`${tableName}.${tableFieldName} = ?`, [
                valueOrArray,
            ]);
        } else if (Array.isArray(valueOrArray)) {
            // If the first element is an object (and not null), treat the entire array as an array of objects
            if (
                typeof valueOrArray[0] === 'object' &&
                valueOrArray[0] !== null
            ) {
                const conditions = valueOrArray.map((obj) =>
                    mysql.format(`${tableName}.${tableFieldName} = ?`, [
                        obj[objectFieldName],
                    ])
                );
                return '(' + conditions.join(' OR ') + ')';
            } else if (typeof valueOrArray[0] === 'string') {
                const conditions = valueOrArray.map((value) =>
                    mysql.format(`${tableName}.${tableFieldName} = ?`, [value])
                );
                return '(' + conditions.join(' OR ') + ')';
            }
        }

        return '1';
    }

    /** Tworzy fragment WHERE gdzie elementy tablicy - grupy warunków są połączene przez OR
     */
    static makeOrGroupsConditions<Conditions>(
        orConditions: Conditions[],
        makeAndConditions: (orCondition: Conditions) => string
    ) {
        const orGroups = orConditions.map(
            (orCondition) => '(' + makeAndConditions(orCondition) + ')'
        );
        const orGroupsCondition = orGroups.join(' OR ');
        return orGroupsCondition || '1';
    }
}
