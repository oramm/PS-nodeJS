import { OAuth2Client } from 'google-auth-library';
import { sheets_v4, google } from 'googleapis';
import Setup from '../setup/Setup';
import { Envi } from './EnviTypes';

export default class ToolsSheets {
    static async getSpreadSheet(auth: OAuth2Client, spreadsheetId: string) {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.get({
            spreadsheetId,
            auth,
        });
        return res;
    }

    static async getSpreadSheetValues(auth: OAuth2Client, parameters: { spreadsheetId: string, sheetName: string }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: parameters.spreadsheetId,
            auth,
            range: parameters.sheetName
        });
        return res;
    }

    static async updateSpreadSheetValues(auth: OAuth2Client, parameters: { spreadsheetId: string, sheetName: string }) {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.values.update({
            spreadsheetId: parameters.spreadsheetId,
            auth,
            range: parameters.sheetName,
            valueInputOption: 'USER_ENTERED',
        });
        return res;
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
            //insertDataOption: 'INSERT_ROWS',

        });
        return res;
    }

    /**
     * Prints the names and majors of students in a sample spreadsheet:
     * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
     * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
     */
    static async listMajors(auth: OAuth2Client) {
        const sheets = google.sheets({ version: 'v4', auth });
        try {
            const dataValues = await sheets.spreadsheets.values.get({
                spreadsheetId: Setup.Sheets.scrumSheetId,
                range: Setup.Sheets.scrumSheetDataName,
            });
            const rows = dataValues.data.values;
            if (rows && rows.length) {
                console.log('Name, Major:');
                // Print columns A and E, which correspond to indices 0 and 4.
                rows.map((row) => {
                    console.log(`${row[0]}, ${row[4]}`);
                });
            } else {
                console.log('No data found.');
            }
        }
        catch (error) {
            console.error(error);
        }
    }

}