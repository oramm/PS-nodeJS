import { throws } from 'assert';
import { OAuth2Client } from 'google-auth-library';
import { sheets_v4, google } from 'googleapis';
import { Envi } from './EnviTypes';
import Tools from './Tools';

export default class ToolsSheets {
    static async getSpreadSheet(auth: OAuth2Client, spreadsheetId: string) {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.get({
            spreadsheetId,
            auth,
        });
        return res;
    }

    static async getValues(auth: OAuth2Client, parameters: { spreadsheetId: string, rangeA1: string }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: parameters.spreadsheetId,
            auth,
            range: parameters.rangeA1
        });
        return res.data;
    }

    static async getLastRow(auth: OAuth2Client, parameters: { spreadsheetId: string }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: parameters.spreadsheetId,
            auth,
            //range: parameters.rangeA1
        });
        return res.data.values?.length;
    }

    static async updateValues(auth: OAuth2Client, parameters: { spreadsheetId: string, rangeA1: string, values: any[][] | any[], majorDimension?: 'ROWS' | 'COLUMNS' }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const resource = {
            values: parameters.values,
            majorDimension: (parameters.majorDimension) ? parameters.majorDimension : 'ROWS'
        };
        const res = await sheets.spreadsheets.values.update({
            requestBody: resource,
            spreadsheetId: parameters.spreadsheetId,
            auth,
            range: parameters.rangeA1,
            valueInputOption: 'USER_ENTERED',//'RAW'
        });
        return res;
    }

    /**edytuj wiersze zawierające szukaną wartość w danej kolumnie */
    static async editRowsByColValue(auth: OAuth2Client, parameters: {
        spreadsheetId: string,
        sheetName: string,
        searchColName?: string,
        searchColIndex?: number,
        valueToFind: string | number
        firstColumnNumber?: number,
        firstColumnName?: string,
        values: (string | number)[][] | (string | number)[],
        hasHeaderRow?: boolean,
        majorDimension?: 'ROWS' | 'COLUMNS'
    }): Promise<number | undefined> {
        if (parameters.searchColIndex === undefined && parameters.searchColName === undefined)
            throw new Error('podaj index lub nazwę kolumny do przeszukania!')
        if (parameters.firstColumnNumber === undefined && parameters.firstColumnName === undefined)
            throw new Error('podaj numer lub nazwę pierwszej kolumny do edycji!')

        let sheetValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: parameters.spreadsheetId,
            rangeA1: parameters.sheetName
        })).values;
        const searchColIndex = (parameters.searchColName) ? sheetValues[0].indexOf(parameters.searchColName) : <number>parameters.searchColIndex;
        const firstColumnNumber = (parameters.firstColumnName) ? sheetValues[0].indexOf(parameters.firstColumnName) + 1 : <number>parameters.firstColumnNumber;

        let firstRow = Tools.findFirstInRange(parameters.valueToFind, sheetValues, searchColIndex);
        let lastRow: number = 0;
        if (firstRow) {
            if (parameters.hasHeaderRow) firstRow++;
            lastRow = <number>Tools.findLastInRange(parameters.valueToFind, sheetValues, searchColIndex);
            await ToolsSheets.updateValues(auth, {
                spreadsheetId: parameters.spreadsheetId,
                rangeA1: `${parameters.sheetName}!${ToolsSheets.R1C1toA1(firstRow + 1, firstColumnNumber)}:` +
                    `${ToolsSheets.R1C1toA1(lastRow + 1, firstColumnNumber)}`,
                values: parameters.values,
                majorDimension: parameters.majorDimension
            });
        }
        return firstRow;
    }

    static async clearValues(auth: OAuth2Client, parameters: { spreadsheetId: string, range: string }) {
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.clear({
            spreadsheetId: parameters.spreadsheetId,
            auth,
            range: parameters.range
        });
        return res;
    }
    /**
     * https://developers.google.com/sheets/api/samples/rowcolumn#insert_an_empty_row_or_column
     */
    private static async insertRowsOrColumns(auth: OAuth2Client, parameters: {
        spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number, dimension: 'ROWS' | 'COLUMNS'
    }) {
        const newRowRequest = {
            insertDimension: {
                range: {
                    sheetId: parameters.sheetId,
                    dimension: parameters.dimension,
                    startIndex: parameters.startIndex,
                    endIndex: parameters.endIndex
                },
                inheritFromBefore: true
            }
        };

        return await this.batchUpdateSheet(auth, [newRowRequest], parameters.spreadsheetId);
    }

    static async insertRows(auth: OAuth2Client, parameters: { spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number }) {
        return await this.insertRowsOrColumns(auth, {
            spreadsheetId: parameters.spreadsheetId,
            sheetId: parameters.sheetId,
            dimension: 'ROWS',
            startIndex: parameters.startIndex,
            endIndex: parameters.endIndex
        });
    }
    static async insertCols(auth: OAuth2Client, parameters: { spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number }) {
        return await this.insertRowsOrColumns(auth, {
            spreadsheetId: parameters.spreadsheetId,
            sheetId: parameters.sheetId,
            dimension: 'COLUMNS',
            startIndex: parameters.startIndex,
            endIndex: parameters.endIndex
        });
    }

    static async repeatFormula(auth: OAuth2Client,
        parameters: {
            range: {
                sheetId: number,
                startRowIndex: number,
                endRowIndex: number,
                startColumnIndex?: number,
                endColumnIndex?: number
            },
            formula: string,
            spreadsheetId: string
        }) {
        const request = {
            repeatCell: {
                range: parameters.range,
                cell: {
                    userEnteredValue: {
                        formulaValue: parameters.formula
                    }
                },
                fields: "userEnteredValue"
            }
        };
        return await this.batchUpdateSheet(auth, [request], parameters.spreadsheetId);
    }
    /**powtarza rózne formuły w tym samym arkuszu  */
    static async repeatFormulas(auth: OAuth2Client,
        parameters: {
            formulaRequests: {
                range: {
                    sheetId?: number
                    startRowIndex: number,
                    endRowIndex: number,
                    startColumnIndex?: number,
                    endColumnIndex?: number
                },
                formula: string
            }[],
            sheetId: number,
            spreadsheetId: string
        }) {
        let bathUpdateRequests: any[] = [];
        for (const formulaRequest of parameters.formulaRequests) {
            formulaRequest.range.sheetId = parameters.sheetId;
            bathUpdateRequests.push({
                repeatCell: {
                    range: formulaRequest.range,
                    cell: {
                        userEnteredValue: {
                            formulaValue: formulaRequest.formula
                        }
                    },
                    fields: "userEnteredValue"
                }
            });
        }
        return await this.batchUpdateSheet(auth, bathUpdateRequests, parameters.spreadsheetId);
    }

    /**
     * Domyślnie kopiuje formatowanie w wierszach
     * https://developers.google.com/sheets/api/samples/data#copy_and_paste_cell_formatting
     */
    static async copyPasteRows(auth: OAuth2Client,
        parameters: {
            source: {
                sheetId: number,
                startRowIndex: number,
                endRowIndex: number,
                startColumnIndex?: number,
                endColumnIndex?: number
            },
            destination: {
                sheetId: number,
                startRowIndex: number,
                endRowIndex: number,
                startColumnIndex?: number,
                endColumnIndex?: number
            },
            pasteType?: 'PASTE_NORMAL' | 'PASTE_VALUES' | 'PASTE_FORMAT' | 'PASTE_NO_BORDERS' | 'PASTE_FORMULA' | 'PASTE_DATA_VALIDATION' | 'PASTE_CONDITIONAL_FORMATTING',
            pasteOrientation?: 'NORMAL' | 'TRANSPOSE',
            spreadsheetId: string
        }) {
        const request = {
            copyPaste: {
                source: parameters.source,
                destination: parameters.destination,
                pasteType: (parameters.pasteType) ? parameters.pasteType : 'PASTE_NORMAL',
                pasteOrientation: (parameters.pasteOrientation) ? parameters.pasteOrientation : 'NORMAL'
            }
        };

        return await ToolsSheets.batchUpdateSheet(auth, [request], parameters.spreadsheetId);
    }

    static async batchUpdateSheet(auth: OAuth2Client, batchUpdateRequests: any[], spreadsheetId: string) {
        const sheets = google.sheets({ version: 'v4', auth });

        return await sheets.spreadsheets.batchUpdate({
            requestBody: { requests: batchUpdateRequests },
            spreadsheetId: spreadsheetId,
            auth: auth
        });
    }

    static async appendRowsToSpreadSheet(auth: OAuth2Client, parameters: { spreadsheetId: string, sheetName: string, values: any[][] }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const resource = {
            values: parameters.values
        };

        const res = await sheets.spreadsheets.values.append({
            //@ts-ignore
            resource: resource,
            spreadsheetId: parameters.spreadsheetId,
            auth,
            range: parameters.sheetName,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',

        });
        return res;
    }
    /**
     * https://stackoverflow.com/questions/46093498/how-to-delete-rows-from-google-spreadsheet
     * https://developers.google.com/sheets/api/samples/rowcolumn#delete_rows_or_columns
     * @param auth 
     * @param parameters 
     * @returns 
     */
    static async deleteRowsOrColumns(auth: OAuth2Client, parameters: {
        spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number, dimension: 'ROWS' | 'COLUMNS'
    }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const resource = {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: parameters.sheetId,
                            dimension: parameters.dimension,
                            startIndex: parameters.startIndex,
                            endIndex: parameters.endIndex
                        }
                    }
                }
            ]
        };

        const res = await sheets.spreadsheets.batchUpdate({
            //@ts-ignore
            resource: resource,
            spreadsheetId: parameters.spreadsheetId,
            auth,
        });
        return res;
    }

    static async deleteRows(auth: OAuth2Client, parameters: {
        spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number
    }) {
        await this.deleteRowsOrColumns(auth, {
            spreadsheetId: parameters.spreadsheetId,
            sheetId: parameters.sheetId,
            startIndex: parameters.startIndex,
            endIndex: parameters.endIndex,
            dimension: 'ROWS'
        });
    }
    /** usuwa wiersze posiadające tą samą wartość w danej kolumnie 
    */
    static async deleteRowsByColValue(auth: OAuth2Client, parameters: {
        spreadsheetId: string,
        sheetId: number,
        sheetName: string,
        valueToFind: string | number,
        searchColName?: string,
        searchColIndex?: number
    }) {
        if (parameters.searchColIndex === undefined && parameters.searchColName === undefined)
            throw new Error('podaj index lub nazwę kolumny!')
        let sheetValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: parameters.spreadsheetId,
            rangeA1: parameters.sheetName
        })).values;
        const searchColIndex = (parameters.searchColName) ? sheetValues[0].indexOf(parameters.searchColName) : <number>parameters.searchColIndex;

        const firstRow = Tools.findFirstInRange(parameters.valueToFind, sheetValues, searchColIndex);
        let lastRow: number = 0;
        if (firstRow) {
            lastRow = <number>Tools.findLastInRange(parameters.valueToFind, sheetValues, searchColIndex);
            await ToolsSheets.deleteRows(auth, {
                spreadsheetId: parameters.spreadsheetId,
                sheetId: parameters.sheetId,
                startIndex: firstRow,
                endIndex: lastRow + 1
            });
        }
        return { firstRow, lastRow }
    }

    static async deleteColumns(auth: OAuth2Client, parameters: {
        spreadsheetId: string, sheetId: number, startIndex: number, endIndex: number
    }) {
        await this.deleteRowsOrColumns(auth, {
            spreadsheetId: parameters.spreadsheetId,
            sheetId: parameters.sheetId,
            startIndex: parameters.startIndex,
            endIndex: parameters.endIndex,
            dimension: 'COLUMNS'
        });
    }

    static R1C1toA1(row: number, column: number, staticAddres?: 'R' | 'C' | 'RC') {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const base = chars.length;
        let columnRef = '';

        if (column < 1) {
            columnRef = chars[0];
        } else {
            let maxRoot = 0;
            while (base ** (maxRoot + 1) < column) {
                maxRoot++;
            }

            let remainder = column;
            for (let root = maxRoot; root >= 0; root--) {
                const value = Math.floor(remainder / base ** root);
                remainder -= (value * base ** root);
                columnRef += chars[value - 1];
            }
        }
        const staticRow = (staticAddres && staticAddres.includes('R')) ? '$' : ''
        const staticCol = (staticAddres && staticAddres.includes('C')) ? '$' : ''
        // Use Math.max to ensure minimum row is 1
        return `${staticCol}${columnRef}${staticRow}${Math.max(row, 1)}`;
    };
}