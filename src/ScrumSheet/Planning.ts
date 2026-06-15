import ToolsSheets from '../tools/ToolsSheets';
import { OAuth2Client } from 'google-auth-library';
import Setup from '../setup/Setup';
import Tools from '../tools/Tools';
import PersonsController from '../persons/PersonsController';
import Person from '../persons/Person';
import CurrentSprint from './CurrentSprint';
import { identitytoolkit } from 'googleapis/build/src/apis/identitytoolkit';

export default class Planning {
    static async refreshTimeAvailable(auth: OAuth2Client, persons?: Person[]) {
        const planingValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.Planning.name,
            })
        ).values;

        const hoursAvailableColIndex = planingValues[0].indexOf(
            Setup.ScrumSheet.Planning.hoursAvailableColName
        );
        const workingDaysColIndex = planingValues[0].indexOf(
            Setup.ScrumSheet.Planning.workingDaysColName
        );
        const extraMeetingsSummaryColNumber =
            planingValues[1].indexOf(
                Setup.ScrumSheet.Planning.extraMeetingsColName
            ) + 1;
        if (!persons) {
            // const orConditions = [{ systemRoleName: 'ENVI_EMPLOYEE' }];
            // persons = (await PersonsController.find(orConditions)) || [];
            persons = await CurrentSprint.getTimesSummaryPersons();
        }
        // Liczba osób w arkuszu przed odświeżeniem: wiersze - nagłówki (firstDataRow-1) - wiersz SUM (1)
        const nOld =
            planingValues.length - Setup.ScrumSheet.Planning.firstDataRow;
        if (persons.length > nOld) {
            // Wstaw brakujące wiersze danych przed wierszem SUM
            await ToolsSheets.insertRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.Planning.id,
                startIndex:
                    Setup.ScrumSheet.Planning.firstDataRow + nOld - 1,
                endIndex:
                    Setup.ScrumSheet.Planning.firstDataRow +
                    persons.length -
                    1,
            });
        } else if (persons.length < nOld) {
            // Usuń nadmiarowe wiersze danych
            await ToolsSheets.deleteRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.Planning.id,
                startIndex:
                    Setup.ScrumSheet.Planning.firstDataRow +
                    persons.length -
                    1,
                endIndex:
                    Setup.ScrumSheet.Planning.firstDataRow + nOld - 1,
            });
        }

        //lista osób
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${
                Setup.ScrumSheet.Planning.name
            }'!${ToolsSheets.R1C1toA1(
                Setup.ScrumSheet.Planning.firstDataRow,
                1
            )}`,
            values: [persons.map((item) => `${item.name} ${item.surname}`)],
            majorDimension: 'COLUMNS',
        });
        //dane stałe
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1:
                `'${Setup.ScrumSheet.Planning.name}'!${ToolsSheets.R1C1toA1(
                    Setup.ScrumSheet.Planning.firstDataRow,
                    workingDaysColIndex + 1
                )}:` +
                `${ToolsSheets.R1C1toA1(
                    Setup.ScrumSheet.Planning.firstDataRow + persons.length - 2,
                    extraMeetingsSummaryColNumber + 1
                )}`,
            values: [[5, 8, '', 2, 1.5]],
        });
        //dostepne godziny - po prawej
        await ToolsSheets.repeatFormula(auth, {
            range: {
                sheetId: Setup.ScrumSheet.Planning.id,
                startRowIndex: Setup.ScrumSheet.Planning.firstDataRow - 1,
                endRowIndex:
                    Setup.ScrumSheet.Planning.firstDataRow + persons.length - 1,
                startColumnIndex: hoursAvailableColIndex,
                endColumnIndex: hoursAvailableColIndex + 1,
            },
            spreadsheetId: Setup.ScrumSheet.GdId,
            formula: this.timeAvailableFormula(
                Setup.ScrumSheet.Planning.firstDataRow
            ),
        });
        //suma - ostatni wiersz na dole
        await ToolsSheets.repeatFormula(auth, {
            range: {
                sheetId: Setup.ScrumSheet.Planning.id,
                startRowIndex:
                    Setup.ScrumSheet.Planning.firstDataRow + persons.length - 1,
                endRowIndex:
                    Setup.ScrumSheet.Planning.firstDataRow + persons.length,
                startColumnIndex: workingDaysColIndex,
                endColumnIndex: extraMeetingsSummaryColNumber + 1,
            },
            spreadsheetId: Setup.ScrumSheet.GdId,
            formula: this.sumFormula(
                Setup.ScrumSheet.Planning.firstDataRow + persons.length - 1
            ),
        });
    }

    private static timeAvailableFormula(row: number) {
        //'=(B3*C3)-sum(D3:H3)'
        return `=B${row}*C${row}-SUM(D${row}:G${row})`;
    }

    private static sumFormula(rowsCount: number) {
        //'=(B3*C3)-sum(D3:H3)'
        return `=SUM(B${Setup.ScrumSheet.Planning.firstDataRow}:B${rowsCount})`;
    }
}
