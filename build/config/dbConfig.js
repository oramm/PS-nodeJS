"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var mysql_1 = __importDefault(require("mysql"));
var conn = mysql_1.default.createPool({
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
exports.default = conn;
