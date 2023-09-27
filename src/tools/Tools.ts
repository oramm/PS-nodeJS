
export default class Tools {
    static cloneOfObject(object: any) {
        return JSON.parse(JSON.stringify(object));
    }

    /*
     * Obiekt _blobEnviObject:
     * { blobBase64String: base64data,
     *   name: blob.name,
     *   mimeType: blob.mimeType
     * }
     */
    static _blobEnviObjectToBlob(_blobEnviObject: any/*Envi._blobEnviObject*/) {
        return this.b64ToBlob(_blobEnviObject.blobBase64String, _blobEnviObject.mimeType, _blobEnviObject.name);
    }

    //https://stackoverflow.com/questions/35236232/create-image-file-base64-to-blob-using-google-appscript?rq=1
    static b64ToBlob(base64: string, contentType: string, name: string): GoogleAppsScript.Base.Blob {
        if (!contentType) contentType = '';
        //var base64 = "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";
        //var base64 = "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="
        var decoded = Utilities.base64Decode(base64);
        return Utilities.newBlob(decoded, contentType, name);
    }

    static parseObjectsJSON(body: any) {
        const parsedBody: any = {};
        for (const key in body) {
            try {
                parsedBody[key] = JSON.parse(body[key]);
            } catch (error) {
                parsedBody[key] = body[key];
            }
        }
        return parsedBody;
    }

    static enumFieldsToArray(enumToParse: any): { key: string, value: any }[] {
        let array: { key: string, value: any }[] = [];

        for (var n in enumToParse) {
            if (typeof enumToParse[n] === 'number') {
                array.push({ key: n, value: <any>enumToParse[n] });
            }
        }
        return array;
    }

    static makeIdsListString(objectList: any[]): any[] {
        return objectList.map(function (item) {
            var idString = '' + item.id;
            if (objectList.indexOf(item) < objectList.length)
                idString += ', ';

        });
    }

    static createZip(obj: any, parentFolderGdId: string) {
        var blobs = obj.map(function (e: any) {
            return Utilities.newBlob(Utilities.base64Decode(e.data), e.mimeType, e.fileName);
        });
        var zip = Utilities.zip(blobs, "filename.zip");
        return DriveApp.getFolderById(parentFolderGdId).createFile(zip).getId();
    }

    static isInteger(x: any): boolean {
        return (typeof x === "number") && Math.floor(x) === x
    }

    static stringToNumber(value: string) {
        const sanitizedValue = value
            .replace(/\s|[^0-9.]/g, '')
            .replace(/,/g, '.');
        return parseFloat(sanitizedValue);
    }

    static capitalizeFirstLetter(string: string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    static stringToJSONValue(string: string) {
        var sqlString = '';
        sqlString = string.replace(/\'/gi, "\\'");
        sqlString = sqlString.replace(/\"/gi, '\\"');
        sqlString = sqlString.replace(/\//gi, '\\/');
        sqlString = sqlString.replace(/\\/gi, '\\\\');
        return sqlString;
    }

    static stringToJSON(string: string) {
        var values: any = string.match(/(:)(.*?)(","|"})/gm);
        for (var i = 0; i < values.length - 1; i++) {
            values[i] = values[i].substring(2, values[i].length - 3);
            var escapedvalue = this.stringToJSONValue(values[i]);
            string.replace(escapedvalue, values[i]);
        }
        values[i] = values[i].substring(2, values[i].length - 2);

        return string;
    }
    /**zwraca łańcuch znaków pozostały z oryginalnego text po wycięciu fragmentu pomiędzy indeksami start i end */
    static getRemainingString(start: number, end: number, text: string): string {
        const before = text.slice(0, start);
        const after = text.slice(end);
        return before + after;
    }

    static testStringToJSON(string: string) {
        string = this.stringToJSON('{"comment":"/n<div>- sieciowe</div>"}')
        var x = JSON.parse(string);
        return string;
    }

    //returns row Number in scheet by DbId of en alement
    static getRowByDbId(value: string, dataRange: any[], column: number) {
        for (var i = 1; i < dataRange.length; i++) {
            var test = dataRange[i][column];
            if (dataRange[i][column] == value) {
                return i + 1;
            }
        }
    }
    /*
     * szuka danych w kolumnie wybranego arkusza
     */
    static findFirstInRange(valueToFind: string | number, dataValues: any[][], column: number) {
        for (var i = 0; i < dataValues.length; i++) {
            if (dataValues[i][column] == valueToFind) {
                return i;
            }
        }
    }

    /*
     * szuka danych w kolumnie wybranego arkusza
     */
    static findLastInRange(valueToFind: string | number, dataValues: any[], column: number) {
        var lastRow;
        for (var i = 0; i < dataValues.length; i++) {
            if (dataValues[i][column] == valueToFind) {
                lastRow = i;
            }
        }
        return lastRow;
    }

    /*
     * get column
     */
    static getColumnArray(dataValues: any[], colIndex: number) {
        var column = [];
        for (var i = 0; i < dataValues.length; i++) {
            column.push(dataValues[i][colIndex]);
        }
        return column;
    }
    static roundToCurrency(x: number) {
        var number = Math.round(x * 100) / 100;
        return parseFloat('' + number).toFixed(2);
    }
}

export namespace Envi {
    export class ToolsArray {
        static onlyUnique(array: any[]) {
            return array.filter(
                (value, index, self) => self.indexOf(value) === index
            );
        }

        static equals(a: any[], b: any[]) {
            return a.length === b.length &&
                a.every((v, i) => v === b[i]);
        }

        static equalsIgnoreOrder(a: any[], b: any[]) {
            //console.log("equalsIgnoreOrder: %o, %o", a, b)
            if (a.length !== b.length)
                return false;
            const uniqueValues: any = new Set([...a, ...b]);
            for (const v of uniqueValues) {
                const aCount = a.filter((e: any) => e === v).length;
                const bCount = b.filter((e: any) => e === v).length;
                if (aCount !== bCount)
                    return false;
            }
            return true;
        }

        //https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-an-array-of-objects?page=1&tab=votes#tab-top

        static groupBy(array: any[], key: string) {
            return array.reduce(function (rv, x) {
                (rv[x[key]] = rv[x[key]] || []).push(x);
                return rv;
            }, {});
        };
        //finds an element in Array by its value
        static search(nameKey: string, property: string, myArray: any[]) {
            for (const item of myArray)
                if (item[property] === nameKey)
                    return item;
        }
    }
}

