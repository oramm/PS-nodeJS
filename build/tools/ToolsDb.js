"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var dbConfig_1 = __importDefault(require("../config/dbConfig"));
var ToolsDate_1 = __importDefault(require("./ToolsDate"));
var ToolsDb = /** @class */ (function () {
    function ToolsDb() {
    }
    ToolsDb.getQueryCallback = function (sql, callbackFn) {
        console.log(sql);
        dbConfig_1.default.query(sql, function (err, rows, fields) {
            if (err) {
                console.log("Failed to query: " + err.message);
                //throw err;
            }
            // close connection first
            //conn.end();
            // done: call callback with results
            callbackFn(err, rows);
        });
    };
    ToolsDb.prepareValueToSql = function (value) {
        if (value !== undefined && value !== null) {
            if (typeof value === 'number' || typeof value === 'boolean')
                return value;
            var date = value.split("-");
            if (value.length == 10 && date.length == 3 && date[2].length == 4) //czy mamy datę
                return '\'' + ToolsDate_1.default.dateJsToSql(value) + '\'';
            else
                return '\'' + this.stringToSql(value) + '\'';
        }
        else if (value === '')
            return '""';
        else
            return 'null';
    };
    ToolsDb.prepareValueToPreparedStmtSql = function (value) {
        //"startDate":"12-06-2018"
        if (value !== undefined && value !== null) {
            if (typeof value === 'number' || typeof value === 'boolean')
                return value;
            var date = value.split("-");
            if (value.length == 10 && date.length == 3 && date[2].length == 4) //czy mamy datę
                return ToolsDate_1.default.dateJsToSql(value);
            else
                return this.stringToSql(value);
        }
        else if (value === '')
            return '';
        else
            return null;
    };
    ToolsDb.stringToSql = function (string) {
        var sqlString = '';
        if (string !== 'LAST_INSERT_ID()') {
            sqlString = string.replace(/\'/gi, "\\'");
            sqlString = sqlString.replace(/\"/gi, '\\"');
            sqlString = sqlString.replace(/\%/gi, '\\%');
            //sqlString = string.replace(/\_/gi, '\\_');
        }
        return sqlString;
    };
    ToolsDb.sqlToString = function (sqlString) {
        var string = '';
        if (sqlString && string !== 'LAST_INSERT_ID()') {
            string = sqlString.replace(/\\'/gi, "\'");
            string = string.replace(/\\"/gi, '\"');
            string = string.replace(/\\%/gi, '\%');
            //string = sqlString.replace(/\\_/gi, '\_');
        }
        return string;
    };
    return ToolsDb;
}());
exports.default = ToolsDb;
