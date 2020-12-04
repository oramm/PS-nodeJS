"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsDate = /** @class */ (function () {
    function ToolsDate() {
    }
    ToolsDate.isStringAYMDDate = function (string) {
        var x = string.length;
        if (string && string.length == 10) {
            var parts = string.split("-");
            if (parts[0].length == 4 && parts[1].length == 2 && parts[2].length == 2)
                return true;
        }
        else
            return false;
    };
    ToolsDate.isStringADMYDate = function (string) {
        if (string && string.length == 10) {
            var parts = string.split("-");
            if (parts[0].length == 2 && parts[1].length == 2 && parts[2].length == 4)
                return true;
        }
        else
            return false;
    };
    ToolsDate.isStringADate = function (string) {
        if (this.isStringADMYDate(string) || this.isStringAYMDDate(string))
            return true;
        else
            return false;
    };
    //date może być {String || Date}
    ToolsDate.addDays = function (date, days) {
        if (typeof date === 'string' && this.isStringADate(date)) {
            date = new Date(date);
        }
        else if (this.isValidDate(date))
            date.setDate(date.getDate() + days / 1);
        return date;
    };
    ToolsDate.getNextFridayDate = function () {
        var curr = new Date; // get current date
        var first = curr.getDate() - curr.getDay() + 1; // First day is the day of the month - the day of the week
        var last = first + 4; // last day is the first day + 6
        //var firstday = new Date(curr.setDate(first));
        return new Date(curr.setDate(last));
    };
    ToolsDate.getMaxDate = function (dates) {
        return new Date(Math.max.apply(null, dates));
    };
    ToolsDate.isValidDate = function (date) {
        return date instanceof Date && !isNaN(date.getTime());
    };
    ToolsDate.dateJsToSql = function (jsDate) {
        if (jsDate !== undefined) {
            var sqlDate = new Date(jsDate).toISOString().slice(0, 10);
            return sqlDate;
        }
        return jsDate;
    };
    ToolsDate.dateJStoDMY = function (inputDate) {
        if (inputDate) {
            var dd = this.addZero(inputDate.getDate());
            var mm = this.addZero(inputDate.getMonth() + 1); //January is 0!
            var yyyy = inputDate.getFullYear();
            return dd + '-' + mm + '-' + yyyy;
        }
    };
    ToolsDate.dateDMYtoYMD = function (inputDate) {
        if (inputDate) {
            var parts = inputDate.split("-");
            if (parts[2].length == 4)
                return parts[2] + '-' + parts[1] + '-' + parts[0];
            else
                return inputDate;
        }
    };
    ToolsDate.dateYMDtoDMY = function (inputDate) {
        if (inputDate) {
            var parts = inputDate.split("-");
            if (parts[0].length == 4)
                return parts[2] + '-' + parts[1] + '-' + parts[0];
            else
                return inputDate;
        }
    };
    ToolsDate.timestampToString = function (timestamp) {
        if (typeof timestamp === 'string')
            timestamp = new Date(timestamp);
        var day = this.addZero(timestamp.getDate());
        var month = this.addZero(timestamp.getMonth() + 1);
        var year = timestamp.getFullYear();
        var h = this.addZero(timestamp.getHours());
        var m = this.addZero(timestamp.getMinutes());
        return day + '&#8209;' + month + '&#8209;' + year + ' ' +
            h + ':' + m;
    };
    ToolsDate.addZero = function (i) {
        if (i < 10) {
            i = "0" + i;
        }
        return i;
    };
    ToolsDate.dateDiff = function (first, second) {
        return Math.round((second - first) / (1000 * 60 * 60 * 24));
    };
    return ToolsDate;
}());
exports.default = ToolsDate;
