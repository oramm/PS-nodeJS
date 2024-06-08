import Tools from './Tools';

export default class ToolsDate {
    static isStringAYMDDate(string: string) {
        var x = string.length;
        if (string && string.length == 10) {
            var parts = string.split('-');
            if (
                parts[0].length == 4 &&
                parts[1].length == 2 &&
                parts[2].length == 2
            )
                return true;
        } else return false;
    }

    static isStringADMYDate(string: string) {
        if (string && string.length == 10) {
            var parts = string.split('-');
            if (
                parts[0].length == 2 &&
                parts[1].length == 2 &&
                parts[2].length == 4
            )
                return true;
        } else return false;
    }

    static isStringADate(string: string) {
        if (this.isStringADMYDate(string) || this.isStringAYMDDate(string))
            return true;
        else return false;
    }
    //date może być {String || Date}
    static addDays(date: Date | string, days: number): Date {
        if (typeof date === 'string' && this.isStringADate(date)) {
            date = new Date(date);
        }
        if (this.isValidDate(date as Date))
            (date as Date).setDate((date as Date).getDate() + days / 1);
        return date as Date;
    }

    static getNextFridayDate() {
        var curr = new Date(); // get current date
        var first = curr.getDate() - curr.getDay() + 1; // First day is the day of the month - the day of the week
        var last = first + 4; // last day is the first day + 6

        //var firstday = new Date(curr.setDate(first));
        return new Date(curr.setDate(last));
    }

    static getMaxDate(dates: number[]) {
        return new Date(Math.max.apply(null, dates));
    }

    static isValidDate(date: Date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

    /**
     * Przetwarza datę z formatu Date na YYYY-MM-DD
     */
    static toUTC(date: Date): string {
        let utcDate = new Date(
            Date.UTC(
                date.getFullYear(),
                date.getMonth(),
                date.getDate(),
                date.getHours(),
                date.getMinutes(),
                date.getSeconds()
            )
        );
        return utcDate.toISOString().slice(0, 10);
    }
    /**
     * Przetwarza datę z formatu Date lub DD-MM-YYYY na YYYY-MM-DD
     */
    static dateJsToSql(jsDate: Date | string) {
        if (jsDate instanceof Date) return this.toUTC(jsDate);
        if (typeof jsDate === 'string') {
            if (jsDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // format 'YYYY-MM-DD', no conversion necessary
                return jsDate;
            } else if (jsDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
                // format 'DD-MM-YYYY', convert to 'YYYY-MM-DD'
                const parts = jsDate.split('-');
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (
                jsDate.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
            ) {
                // format 'YYYY-MM-DDTHH:mm:ss.sssZ', convert to 'YYYY-MM-DD'
                return jsDate.substring(0, 10);
            } else {
                // invalid format
                throw new Error(`Invalid date format: ${jsDate}`);
            }
        }
    }

    static dateJStoDMY(inputDate: Date) {
        if (inputDate) {
            var dd = Tools.addZero(inputDate.getDate());
            var mm = Tools.addZero(inputDate.getMonth() + 1); //January is 0!
            var yyyy = inputDate.getFullYear();

            return dd + '-' + mm + '-' + yyyy;
        }
    }

    static dateDMYtoYMD(inputDate: string) {
        if (inputDate) {
            var parts = inputDate.split('-');
            if (parts[2].length == 4)
                return parts[2] + '-' + parts[1] + '-' + parts[0];
            else return inputDate;
        }
    }

    static dateYMDtoDMY(inputDate: string) {
        if (inputDate) {
            var parts = inputDate.split('-');
            if (parts[0].length == 4)
                return parts[2] + '-' + parts[1] + '-' + parts[0];
            else return inputDate;
        }
    }

    static timestampToString(timestamp: string | Date) {
        if (typeof timestamp === 'string') timestamp = new Date(timestamp);
        var day = Tools.addZero(timestamp.getDate());
        var month = Tools.addZero(timestamp.getMonth() + 1);
        var year = timestamp.getFullYear();
        var h = Tools.addZero(timestamp.getHours());
        var m = Tools.addZero(timestamp.getMinutes());
        return day + '&#8209;' + month + '&#8209;' + year + ' ' + h + ':' + m;
    }

    static dateDiff(first: number, second: number) {
        return Math.round((second - first) / (1000 * 60 * 60 * 24));
    }
}
