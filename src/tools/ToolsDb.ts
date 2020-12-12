import Setup from "../setup/Setup";
import ToolsDate from './ToolsDate';

export default class ToolsDb {
    static getQueryCallback(sql: string, callbackFn: Function) {
        console.log(sql);
        Setup.conn.query(sql, (err: { message: string; }, rows: any, fields: any) => {
            if (err) {
                console.log("Failed to query: " + err.message)
                //throw err;
            }
            // close connection first
            //conn.end();
            // done: call callback with results
            callbackFn(err, rows);
        });
    }

    static async getQueryCallbackAsync(sql: string) {
        return new Promise((resolve, reject) => {
            Setup.conn.query(sql, (err, rows: any[], fields: any) => {
                if (err) {
                    console.log("Failed to query: " + err.message)
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
            var date = value.split("-");
            if (value.length == 10 && date.length == 3 && date[2].length == 4) //czy mamy datę
                return '\'' + ToolsDate.dateJsToSql(value) + '\'';
            else
                return '\'' + this.stringToSql(value) + '\'';
        }
        else if (value === '')
            return '""';
        else
            return 'null';
    }

    static prepareValueToPreparedStmtSql(value: any) {
        //"startDate":"12-06-2018"
        if (value !== undefined && value !== null) {
            if (typeof value === 'number' || typeof value === 'boolean')
                return value;
            var date = value.split("-");
            if (value.length == 10 && date.length == 3 && date[2].length == 4) //czy mamy datę
                return ToolsDate.dateJsToSql(value);
            else
                return this.stringToSql(value);
        }
        else if (value === '')
            return '';
        else
            return null;
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
            string = sqlString.replace(/\\'/gi, "\'");
            string = string.replace(/\\"/gi, '\"');
            string = string.replace(/\\%/gi, '\%');
            //string = sqlString.replace(/\\_/gi, '\_');
        }
        return string;
    }
}