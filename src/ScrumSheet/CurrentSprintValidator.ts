import { sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import Setup from '../setup/Setup';
import ToolsSheets from '../tools/ToolsSheets';

export default class CurrentSprintValidator {
    static async checkColumns(auth: OAuth2Client, values?: any[][] | null) {
        if (!values) {
            if (!auth) throw new Error('Brak danych arkusza');
            values = (
                await ToolsSheets.getValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                })
            ).values;
            if (!values)
                throw new Error('Brak wartości w arkuszu bieżącego sprintu');
        }
        if (values.length === 0) throw new Error('Arkusz jest pusty');
        if (values[0].length === 0) throw new Error('Brak kolumn w arkuszu');
        if (!values) throw new Error('Brak wartości w arkuszu');

        const firsRowValues = values[0];
        const secondRowValues = values[1];

        const projectIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.projectIdColName
        );
        const contractOurIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.contractOurIdColName
        );
        const contractDbIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.contractDbIdColName
        );
        const milestoneTypeNameColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.milestoneNameColName
        );
        const caseTypeNameColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.caseTypeColName
        );
        const taskOwnerNameColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName
        );

        const milestoneIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.milestoneIdColName
        );
        const caseTypeIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.caseTypeIdColName
        );
        const caseIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.caseIdColName
        );
        const taskIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskIdColName
        );
        const rowStatusColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.rowStatusColName
        );
        const contractNumberColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.contractNumberColName
        );
        const caseNameColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.caseNameColName
        );
        const taskNameColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskNameColName
        );
        const taskDeadlineColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskDeadlineColName
        );
        const taskEstimatedTimeColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskEstimatedTimeColName
        );
        const taskStatusColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskStatusColName
        );
        const taskOwnerIdColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.taskOwnerIdColName
        );
        const monColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.monColName
        );
        const tueColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.tueColName
        );
        const wedColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.wedColName
        );
        const thuColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.thuColName
        );
        const friColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.friColName
        );
        const sprintSumColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.sprintSumColName
        );
        const sprintDiffColIndex = secondRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.sprintDiffColName
        );
        const modeColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.modeColName
        );
        const timesSummaryColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.timesSummaryColName
        );
        const timesColIndex = firsRowValues.indexOf(
            Setup.ScrumSheet.CurrentSprint.timesColName
        );

        const errorMessage = 'Arkusz Scrum uszkodzony! Brak kolumny';
        if (projectIdColIndex === -1)
            throw new Error(`${errorMessage} Id projektu`);
        if (contractOurIdColIndex === -1)
            throw new Error(`${errorMessage} ourId kontraktu`);
        if (contractDbIdColIndex === -1)
            throw new Error(`${errorMessage} dbId kontraktu`);
        if (milestoneTypeNameColIndex === -1)
            throw new Error(`${errorMessage} nazwa kamienia milowego`);
        if (caseTypeNameColIndex === -1)
            throw new Error(`${errorMessage} typ sprawy i numer sprawy`);
        if (taskOwnerNameColIndex === -1)
            throw new Error(`${errorMessage} Kto`);

        if (milestoneIdColIndex === -1)
            throw new Error(`${errorMessage} Id kamienia milowego`);
        if (caseTypeIdColIndex === -1)
            throw new Error(`${errorMessage} Id typu sprawy`);
        if (caseIdColIndex === -1) throw new Error(`${errorMessage} Id sprawy`);
        if (taskIdColIndex === -1)
            throw new Error(`${errorMessage} Id zadania`);
        if (rowStatusColIndex === -1)
            throw new Error(`${errorMessage} #ImportStatus`);
        if (contractNumberColIndex === -1)
            throw new Error(`${errorMessage} Nr kontraktu na roboty/ dostawy`);
        if (caseNameColIndex === -1)
            throw new Error(`${errorMessage} Nazwa sprawy`);
        if (taskNameColIndex === -1)
            throw new Error(`${errorMessage} Nazwa zadania`);
        if (taskDeadlineColIndex === -1)
            throw new Error(`${errorMessage} Deadline`);
        if (taskEstimatedTimeColIndex === -1)
            throw new Error(`${errorMessage} szac. czas`);
        if (taskStatusColIndex === -1)
            throw new Error(`${errorMessage} Status`);
        if (taskOwnerIdColIndex === -1)
            throw new Error(`${errorMessage} Id właściciela`);
        if (monColIndex === -1) throw new Error(`${errorMessage} PON.`);
        if (tueColIndex === -1) throw new Error(`${errorMessage} WTO.`);
        if (wedColIndex === -1) throw new Error(`${errorMessage} SR.`);
        if (thuColIndex === -1) throw new Error(`${errorMessage} CZW.`);
        if (friColIndex === -1) throw new Error(`${errorMessage} PT.`);
        if (sprintSumColIndex === -1) throw new Error(`${errorMessage} Razem`);
        if (sprintDiffColIndex === -1)
            throw new Error(`${errorMessage} Różnica`);
        if (modeColIndex === -1) throw new Error(`${errorMessage} tryb`);
        if (timesSummaryColIndex === -1)
            throw new Error(`${errorMessage} #TimesSummary`);
        if (timesColIndex === -1) throw new Error(`${errorMessage} #Times`);
    }
}
