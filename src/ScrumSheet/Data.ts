import ToolsSheets from "../tools/ToolsSheets";
import { OAuth2Client } from 'google-auth-library';
import Setup from "../setup/Setup";
import Person from "../persons/Person";
import ScrumSheet from "./ScrumSheet";
import CasesController from "../contracts/milestones/cases/CasesController";

export default class Data {
    static async synchronizePersonsInScrum(auth: OAuth2Client, persons?: Person[]) {
        const dataValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.Data.name
        })).values;

        if (!persons)
            persons = await ScrumSheet.scrumGetPersons();

        const personIdColIndex = dataValues[0].indexOf(Setup.ScrumSheet.Data.personIdColName);
        const personNameColIndex = dataValues[0].indexOf(Setup.ScrumSheet.Data.personNameColName);

        await ToolsSheets.clearValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            range:
                `'${Setup.ScrumSheet.Data.name}'!R${Setup.ScrumSheet.Data.firstDataRow}C${personIdColIndex + 1}:` +
                `R${dataValues.length}C${personNameColIndex + 1}`
        });
        const personsData = persons.map(item => [item.id, `${item.name} ${item.surname}`]);
        personsData.push(['', 'd']);

        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${Setup.ScrumSheet.Data.name}'!${ToolsSheets.R1C1toA1(Setup.ScrumSheet.Data.firstDataRow, 1)}`,
            values: personsData,
            majorDimension: 'ROWS'
        });
    }

    static async synchronizeCasesData(auth: OAuth2Client) {
        const dataValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.Data.name
        })).values;

        const cases = await CasesController.getCasesList(auth);
        const caseIdColIndex = dataValues[0].indexOf(Setup.ScrumSheet.Data.caseIdColName);
        const caseGdFolderIdColIndex = dataValues[0].indexOf(Setup.ScrumSheet.Data.caseGdFolderIdColName);

        //SCRUM_DATA_SHEET.getRange(2, SCRUM_DATA_COL_CASE_ID + 1, SCRUM_DATA_SHEET.getLastRow() - 1, 5).clear();
        await ToolsSheets.clearValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            range:
                `'${Setup.ScrumSheet.Data.name}'!R${Setup.ScrumSheet.Data.firstDataRow}C${caseIdColIndex}:` +
                `R${dataValues.length + 1}C${caseGdFolderIdColIndex}`
        });

        const casesData = cases.map(item => [
            item.id,
            item.typeId ? item.typeId : '',
            item.milestoneId,
            item.name,
            item.gdFolderId ? item.gdFolderId : '',
        ]);


        //SCRUM_DATA_SHEET.getRange(20, SCRUM_DATA_COL_CASE_ID + 1, this.casesInDb.length, 5).setValues(casesData);
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${Setup.ScrumSheet.Data.name}'!${ToolsSheets.R1C1toA1(Setup.ScrumSheet.Data.firstDataRow, caseIdColIndex + 1)}`,
            values: [casesData],
            majorDimension: 'ROWS'
        });
    }
}