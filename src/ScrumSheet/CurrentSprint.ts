import ToolsSheets from "../tools/ToolsSheets";
import { OAuth2Client } from 'google-auth-library';
import Setup from "../setup/Setup";
import Tools from "../tools/Tools";
import Person from "../persons/Person";
import ScrumSheet from "./ScrumSheet";

export default class CurrentSprint {
    //ustawia podsumwanie dla wiersza kontraktu (nagłówka)
    static async setSumInContractRow(auth: OAuth2Client, rowNumber: number, rowsCount: number) {
        const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;
        const sprintSumColNumber = currentSprintValues[1].indexOf(Setup.ScrumSheet.CurrentSprint.sprintSumColName) + 1;
        const taskEstimatedColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskEstimatedTimeColName) + 1;
        await Promise.all(
            [
                ToolsSheets.updateValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(rowNumber, taskEstimatedColNumber)}`,
                    //values: [[`=SUM(R[1]C:R[${rowsCount}]C)`]]
                    values: [[
                        `=SUM(${ToolsSheets.R1C1toA1(rowNumber + 1, taskEstimatedColNumber)}:` +
                        `${ToolsSheets.R1C1toA1(rowNumber + rowsCount, taskEstimatedColNumber)})`]]
                }),
                ToolsSheets.repeatFormula(auth, {
                    range: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: rowNumber - 1,
                        endRowIndex: rowNumber,
                        startColumnIndex: sprintSumColNumber - 1,
                        endColumnIndex: sprintSumColNumber + 1
                    },
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    formula: `=SUM(${ToolsSheets.R1C1toA1(rowNumber + 1, sprintSumColNumber)}:` +
                        `${ToolsSheets.R1C1toA1(rowNumber + rowsCount, sprintSumColNumber)})`
                })
            ]);
    }
    //ustawia sumy dla wierszy poszczególnych zadań
    static async setSprintSumsInRows(auth: OAuth2Client, rowNumber: number, rowsCount?: number) {
        const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;
        const sprintSumColNumber = currentSprintValues[1].indexOf(Setup.ScrumSheet.CurrentSprint.sprintSumColName) + 1;
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(rowNumber, sprintSumColNumber)}`,
            values: [[
                `=SUM(${ToolsSheets.R1C1toA1(rowNumber, sprintSumColNumber - 5)}:` +
                `${ToolsSheets.R1C1toA1(rowNumber, sprintSumColNumber - 1)})`,
                `=${ToolsSheets.R1C1toA1(rowNumber, sprintSumColNumber - 8)}-` +
                `${ToolsSheets.R1C1toA1(rowNumber, sprintSumColNumber)}`
            ]]
            //values: [[`=SUM(RC[-5]:RC[-1])`, `=RC[-9]-RC[-1]`]]
        });
    }

    static async sortProjects(auth: OAuth2Client) {
        const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;


        const projectIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.projectIdColName) + 1;
        const contractOurIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName) + 1;
        const contractDbIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractDbIdColName) + 1;
        const milestoneIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneIdColName) + 1;
        const caseTypeColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.caseTypeIdColName) + 1;
        const taskOwnerNameColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName) + 1;

        const lastsortableRow = <number>Tools.findFirstInRange('ENVI', currentSprintValues, projectIdColNumber - 1);

        const sortRequest = {
            sortRange: {
                range: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
                    endRowIndex: lastsortableRow
                },
                sortSpecs: [
                    { dimensionIndex: projectIdColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: contractOurIdColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: contractDbIdColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: milestoneIdColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: caseTypeColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: taskOwnerNameColNumber, sortOrder: 'ASCENDING' }
                ]
            }
        }
        await ToolsSheets.batchUpdateSheet(auth, [sortRequest], Setup.ScrumSheet.GdId);
    }

    static async sortContract(auth: OAuth2Client, ourId: string) {
        const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;

        const contractOurIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName);
        const contractDbIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractDbIdColName) + 1;
        const milestoneIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneIdColName) + 1;
        const caseTypeColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.caseTypeIdColName) + 1;
        const taskOwnerNameColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName) + 1;

        const firstContractRow = <number>Tools.findFirstInRange(ourId, currentSprintValues, contractOurIdColIndex) + 1;
        if (!firstContractRow)
            throw new Error("sortContract:: w arkuszu scrumboard nie znaleziono kontraktu " + ourId);
        const lastContractRow = <number>Tools.findLastInRange(ourId, currentSprintValues, contractOurIdColIndex);

        const sortRequest = {
            sortRange: {
                range: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
                    endRowIndex: lastContractRow
                },
                sortSpecs: [
                    { dimensionIndex: contractDbIdColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: milestoneIdColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: caseTypeColNumber, sortOrder: 'ASCENDING' },
                    { dimensionIndex: taskOwnerNameColNumber, sortOrder: 'ASCENDING' }
                ]
            }
        }
        await ToolsSheets.batchUpdateSheet(auth, [sortRequest], Setup.ScrumSheet.GdId);
    }

    static async getOwnerNameById(auth: OAuth2Client, id: number) {
        if (id) {
            const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;
            const taskOwnerIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskOwnerIdColName);
            const taskOwnerNameColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskOwnerIdColName);

            const chosenOwnerDataSheeRow = Tools.findFirstInRange(id, currentSprintValues, taskOwnerIdColIndex);
            if (chosenOwnerDataSheeRow) return currentSprintValues[chosenOwnerDataSheeRow][taskOwnerNameColIndex];
        }
        return '';
    }

    static async makeTimesSummary(auth: OAuth2Client, persons?: Person[], currentSprintValues?: any[][]) {
        if (!currentSprintValues)
            currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;

        const timesSummaryColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.timesSummaryColName) + 1;
        if (!persons)
            persons = await ScrumSheet.scrumGetPersons();

        const summaryTableRange = {
            spreadsheetId: Setup.ScrumSheet.GdId,
            sheetId: Setup.ScrumSheet.CurrentSprint.id,
            startIndex: timesSummaryColNumber,
            endIndex: timesSummaryColNumber + persons.length
        }
        await ToolsSheets.deleteColumns(auth, summaryTableRange);
        await ToolsSheets.insertCols(auth, summaryTableRange);

        const timesColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.timesColName) + 1;

        const formulas: any[][] = [[], [], [], [], [], [], [], [], [], [], [], []];
        const modeColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.modeColName) + 1;

        await ToolsSheets.clearValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            range:
                `'${Setup.ScrumSheet.CurrentSprint.name}'!R${Setup.ScrumSheet.CurrentSprint.firstDataRow}C${timesSummaryColNumber - 1}:` +
                `R${currentSprintValues.length}C${timesColNumber - 1}`
        });
        this.printTimesDescriptions(auth, timesSummaryColNumber);

        for (let i = 0; i < persons.length; i++) {
            let col = timesSummaryColNumber + i + 1;
            formulas[0].push(persons[i]._alias);

            formulas[1].push(this.timeLeftFormula(
                Setup.ScrumSheet.CurrentSprint.firstDataRow - 2,
                col,
                modeColNumber
            ));

            //---------------zaplanowane czasy
            formulas[2].push(`=planowanie!H${i + 3}`);

            formulas[3].push(`=SUM(${ToolsSheets.R1C1toA1(Setup.ScrumSheet.CurrentSprint.firstDataRow, timesColNumber + i)}:` +
                `${ToolsSheets.R1C1toA1(currentSprintValues.length, timesColNumber + i)})`);
            //ustaw czasy dzienne każdej osobie
            for (var j = 4; j <= 8; j++)
                formulas[j].push(await this.scrumDailyWorkouts(auth, `${persons[i].name} ${persons[i].surname}`, j, currentSprintValues))

            const meetings = `=SUM(planowanie!E${i + 3}:G${i + 3})`;
            //---------------= SUM(${r1}C:R[-1]C)
            formulas[9].push(meetings);

            let r1 = Setup.ScrumSheet.CurrentSprint.firstDataRow + 1
            //---------------
            formulas[10].push(`=SUM(` +
                `${ToolsSheets.R1C1toA1(r1, col)}:` +
                `${ToolsSheets.R1C1toA1(10, col)})`
            );

            r1 = Setup.ScrumSheet.CurrentSprint.firstDataRow - 1;
            //`= R${ r1 } C - R[-1]C`
            const diff = `= ${ToolsSheets.R1C1toA1(r1, col)}-` +
                `${ToolsSheets.R1C1toA1(r1 - 1, col)}`
            formulas[11].push(diff);

        }

        ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${Setup.ScrumSheet.CurrentSprint.name}'!${ToolsSheets.R1C1toA1(1, timesSummaryColNumber + 1)}`,
            values: formulas,
        });
    }

    private static timeLeftFormula(row: number, col: number, modeColNumber: number) {
        //'=IF(R1C' + modeColNumber + '="Planowanie"; R[1]C-R[2]C;R[2]C-R[9]C)'
        return `=IF(${ToolsSheets.R1C1toA1(1, modeColNumber + 1, 'RC')}="Planowanie";` +
            `${ToolsSheets.R1C1toA1(row + 1, col)}-${ToolsSheets.R1C1toA1(row + 2, col)};` +
            `${ToolsSheets.R1C1toA1(row + 2, col)}-${ToolsSheets.R1C1toA1(row + 9, col)})`;
    }

    private static printTimesDescriptions(auth: OAuth2Client, timesSummaryColNumber: number) {
        const desciptions = [['WYKONANO', 'PON.', 'WT.', 'ŚR.', 'CZW.', 'PT.', 'spotk', 'Razem', 'CZAS PRACY']];
        ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${Setup.ScrumSheet.CurrentSprint.name}'!${ToolsSheets.R1C1toA1(Setup.ScrumSheet.CurrentSprint.firstDataRow, timesSummaryColNumber)}`,
            values: desciptions,
            majorDimension: 'COLUMNS'
        });
    }

    static async scrumDailyWorkouts(auth: OAuth2Client, personName: string, dayShift: number, currentSprintValues?: any[][]) {
        if (!currentSprintValues)
            currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;
        const cAllPersons = currentSprintValues[1].indexOf(Setup.ScrumSheet.CurrentSprint.monColName);
        const cDay = currentSprintValues[1].indexOf(Setup.ScrumSheet.CurrentSprint.monColName) - 3 + dayShift;

        //=SUMIF(R4C-1:R295C-1;"=";R4C0:R295C0)
        const formula = `=SUMIF(` +
            `${ToolsSheets.R1C1toA1(Setup.ScrumSheet.CurrentSprint.firstDataRow, cAllPersons)}:${ToolsSheets.R1C1toA1(currentSprintValues.length, cAllPersons)};` +
            `"=${personName}";` +
            `${ToolsSheets.R1C1toA1(Setup.ScrumSheet.CurrentSprint.firstDataRow, cDay)}:${ToolsSheets.R1C1toA1(currentSprintValues.length, cDay)}` +
            `)`
        return formula;
    }

    static async makepersonTimePerTaskFormulas(auth: OAuth2Client, persons?: Person[], currentSprintValues?: any[][]) {
        if (!currentSprintValues)
            currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;

        if (!persons)
            persons = await ScrumSheet.scrumGetPersons();

        const timesColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.timesColName);
        const formulaRequests = [];
        for (let i = 0; i < persons.length; i++) {
            formulaRequests.push({
                range: {
                    startRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
                    endRowIndex: currentSprintValues.length,
                    startColumnIndex: timesColIndex + i,
                    endColumnIndex: timesColIndex + persons.length + i + 1
                },
                formula: this.personTimePerTaskFormula(currentSprintValues, Setup.ScrumSheet.CurrentSprint.firstDataRow + 1, persons[i])
            })
        }

        await ToolsSheets.repeatFormulas(auth, {
            sheetId: Setup.ScrumSheet.CurrentSprint.id,
            spreadsheetId: Setup.ScrumSheet.GdId,
            formulaRequests
        });
    }

    private static personTimePerTaskFormula(currentSprintValues: any[][], row: number, person: Person) {
        //=IF(AND(($R4="Sylwia Kulczycka");($O4<>""));IF(OR($Q4="Zrobiony";$Q4="Oczekiwanie na odpowiedź - ONI";$Q4="Do weryfikacji - ONI");$X4;MAX($P4;$X4));"")
        //=IF(
        //AND(($R4="Sylwia Kulczycka");($O4<>""));
        //IF(OR($Q4="Zrobiony";$Q4="Oczekiwanie na odpowiedź - ONI";$Q4="Do weryfikacji - ONI");
        //$X4;MAX($P4;$X4));""
        //)
        const personColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName) + 1;
        const personA1 = ToolsSheets.R1C1toA1(row, personColNumber, 'C');

        const deadlineColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskDeadlineColName) + 1;
        const deadlineA1 = ToolsSheets.R1C1toA1(row, deadlineColNumber, 'C');

        const statusColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskStatusColName) + 1;
        const statusA1 = ToolsSheets.R1C1toA1(row, statusColNumber, 'C');

        const estimatedTimeColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskEstimatedTimeColName) + 1;
        const estimatedTimeA1 = ToolsSheets.R1C1toA1(row, estimatedTimeColNumber, 'C');

        const sprintSumColNumber = currentSprintValues[1].indexOf(Setup.ScrumSheet.CurrentSprint.sprintSumColName) + 1;
        const sprintSumA1 = ToolsSheets.R1C1toA1(row, sprintSumColNumber, 'C');

        const nameSurname = `${person.name} ${person.surname}`
        return `=IF(` +
            `AND((${personA1}="${nameSurname}");(${deadlineA1}<>""));` +
            `IF(OR(${statusA1}="Zrobiony"; ${statusA1}="Oczekiwanie na odpowiedź - ONI"; ${statusA1}="Do weryfikacji - ONI");${sprintSumA1}; MAX(${estimatedTimeA1}; ${sprintSumA1}));` +
            `"")`
    }
}