import ToolsSheets from '../tools/ToolsSheets';
import { OAuth2Client } from 'google-auth-library';
import Setup from '../setup/Setup';
import Tools from '../tools/Tools';
import Person from '../persons/Person';
import ScrumSheet from './ScrumSheet';
import CurrentSprintValidator from './CurrentSprintValidator';

export default class CurrentSprint {
    /** Usuwa usuwa wiersze posiadające tą samą wartość w danej kolumnie currentSprint*/
    static async deleteRowsByColValue(
        auth: OAuth2Client,
        parameters: {
            searchColName?: string;
            searchColIndex?: number;
            valueToFind: string | number;
        }
    ) {
        const res = await ToolsSheets.deleteRowsByColValue(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            sheetId: Setup.ScrumSheet.CurrentSprint.id,
            sheetName: Setup.ScrumSheet.CurrentSprint.name,
            searchColName: parameters.searchColName,
            searchColIndex: parameters.searchColIndex,
            valueToFind: parameters.valueToFind,
        });
        if (res.lastRow < 13) {
            this.makeTimesSummary(auth);
        }
    }
    /**edytuj wiersze zawierające szukaną wartość w danej kolumnie */
    static async editRowsByColValue(
        auth: OAuth2Client,
        parameters: {
            searchColName?: string;
            searchColIndex?: number;
            valueToFind: string | number;
            firstColumnNumber?: number;
            firstColumnName?: string;
            rowValues: (string | number)[];
            hasHeaderRow?: boolean;
            majorDimension?: 'ROWS' | 'COLUMNS';
            firstRowOnly?: boolean;
        }
    ) {
        return await ToolsSheets.editRowsByColValue(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            sheetName: Setup.ScrumSheet.CurrentSprint.name,
            valueToFind: parameters.valueToFind,
            searchColIndex: parameters.searchColIndex,
            searchColName: parameters.searchColName,
            firstColumnNumber: parameters.firstColumnNumber,
            firstColumnName: parameters.firstColumnName,
            rowValues: parameters.rowValues,
            hasHeaderRow: parameters.hasHeaderRow,
            majorDimension: parameters.majorDimension,
            firstRowOnly: parameters.firstRowOnly,
        });
    }

    /** ustawia podsumwanie dla wiersza kontraktu (nagłówka) */
    static async setSumInContractRow(
        auth: OAuth2Client,
        contractOurId: string
    ) {
        const currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;
        const sprintSumColNumber =
            currentSprintValues[1].indexOf(
                Setup.ScrumSheet.CurrentSprint.sprintSumColName
            ) + 1;
        const taskEstimatedColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskEstimatedTimeColName
            ) + 1;
        const contractOurIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.contractOurIdColName
        );

        const headerContractRowNumber =
            <number>(
                Tools.findFirstInRange(
                    contractOurId,
                    currentSprintValues,
                    contractOurIdColIndex
                )
            ) + 1;
        const lastContractRowNumber =
            <number>(
                Tools.findLastInRange(
                    contractOurId,
                    currentSprintValues,
                    contractOurIdColIndex
                )
            ) + 1;
        const contractTasksRowsCount =
            lastContractRowNumber - headerContractRowNumber;

        await Promise.all([
            ToolsSheets.repeatFormula(auth, {
                range: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex: headerContractRowNumber - 1,
                    endRowIndex: headerContractRowNumber,
                    startColumnIndex: sprintSumColNumber - 6,
                    endColumnIndex: sprintSumColNumber + 1,
                },
                spreadsheetId: Setup.ScrumSheet.GdId,
                formula:
                    `=SUM(${ToolsSheets.R1C1toA1(
                        headerContractRowNumber + 1,
                        sprintSumColNumber - 5
                    )}:` +
                    `${ToolsSheets.R1C1toA1(
                        headerContractRowNumber + contractTasksRowsCount,
                        sprintSumColNumber - 5
                    )})`,
            }),
        ]);
    }

    /** ustawia sumy dla wierszy poszczególnych zadań */
    static async setSprintSumsInRows(
        auth: OAuth2Client,
        rowNumber: number,
        rowsCount?: number
    ) {
        const currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;
        const sprintSumColNumber =
            currentSprintValues[1].indexOf(
                Setup.ScrumSheet.CurrentSprint.sprintSumColName
            ) + 1;
        if (sprintSumColNumber === 0)
            throw new Error(
                'ScrumBoard uszkodzony - brakuje kolumny ' +
                    Setup.ScrumSheet.CurrentSprint.sprintSumColName
            );
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `${
                Setup.ScrumSheet.CurrentSprint.name
            }!${ToolsSheets.R1C1toA1(rowNumber, sprintSumColNumber)}`,
            values: [
                [
                    `=SUM(${ToolsSheets.R1C1toA1(
                        rowNumber,
                        sprintSumColNumber - 5
                    )}:` +
                        `${ToolsSheets.R1C1toA1(
                            rowNumber,
                            sprintSumColNumber - 1
                        )})`,
                    `=${ToolsSheets.R1C1toA1(
                        rowNumber,
                        sprintSumColNumber - 8
                    )}-` +
                        `${ToolsSheets.R1C1toA1(
                            rowNumber,
                            sprintSumColNumber
                        )}`,
                ],
            ],
            //values: [[`=SUM(RC[-5]:RC[-1])`, `=RC[-9]-RC[-1]`]]
        });
    }

    static async sortProjects(auth: OAuth2Client) {
        const currentSprintValues = (
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;

        if (!currentSprintValues) {
            throw new Error('NIe udało się pobrać danych z arkusza scrumboard');
        }

        try {
            await CurrentSprintValidator.checkColumns(
                auth,
                currentSprintValues
            );
        } catch (err) {
            console.error(err);
            if (err instanceof Error)
                throw new Error(
                    'sortProjects:: błąd walidacji arkusza scrumboard \n' +
                        err.message
                );
        }
        const projectIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.projectIdColName
        );
        const contractOurIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.contractOurIdColName
        );
        const contractDbIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.contractDbIdColName
        );
        const milestoneTypeNameColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.milestoneNameColName
        );
        const caseTypeNameColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.caseTypeColName
        );
        const taskOwnerNameColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName
        );

        const lastsortableRow = <number>(
            Tools.findFirstInRange(
                'ENVI',
                currentSprintValues,
                projectIdColIndex
            )
        );

        const sortRequest = {
            sortRange: {
                range: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex:
                        Setup.ScrumSheet.CurrentSprint.firstDataRow - 1,
                    endRowIndex: lastsortableRow,
                },
                sortSpecs: [
                    {
                        dimensionIndex: projectIdColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: contractOurIdColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: contractDbIdColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: milestoneTypeNameColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: caseTypeNameColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: taskOwnerNameColIndex,
                        sortOrder: 'ASCENDING',
                    },
                ],
            },
        };

        try {
            await ToolsSheets.batchUpdateSheet(
                auth,
                [sortRequest],
                Setup.ScrumSheet.GdId
            );
        } catch (err) {
            console.error(err);
            throw new Error('sortProjects:: błąd sortowania scrumboard');
        }
    }

    static async sortContract(auth: OAuth2Client, ourId: string) {
        const currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;

        const contractOurIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.contractOurIdColName
        );
        const contractDbIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.contractDbIdColName
        );
        const milestoneTypeNameColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.milestoneNameColName
        );
        const caseTypeNameColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.caseTypeColName
        );
        const taskOwnerNameColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName
        );

        const firstContractRowNumber =
            <number>(
                Tools.findFirstInRange(
                    ourId,
                    currentSprintValues,
                    contractOurIdColIndex
                )
            ) + 1;
        if (!firstContractRowNumber)
            throw new Error(
                'sortContract:: w arkuszu scrumboard nie znaleziono kontraktu ' +
                    ourId
            );
        const lastContractRowNumber =
            <number>(
                Tools.findLastInRange(
                    ourId,
                    currentSprintValues,
                    contractOurIdColIndex
                )
            ) + 1;

        // Ensure consistency of contract ID in column C for the current range
        for (
            let i = firstContractRowNumber - 1;
            i <= lastContractRowNumber - 1;
            i++
        ) {
            const currentRow = currentSprintValues[i];
            const currentValue = currentRow[contractOurIdColIndex] as string;
            if (currentValue.trim() !== ourId.trim()) {
                console.log('Row with problem:', currentRow);
                throw new Error(
                    `Inconsistent contractOurId in row ${
                        i + 1
                    }: expected '${ourId}', but found '${currentValue}'`
                );
            }
        }

        const sortRequest = {
            sortRange: {
                range: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex: firstContractRowNumber - 1,
                    endRowIndex: lastContractRowNumber,
                },
                sortSpecs: [
                    {
                        dimensionIndex: contractDbIdColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: milestoneTypeNameColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: caseTypeNameColIndex,
                        sortOrder: 'ASCENDING',
                    },
                    {
                        dimensionIndex: taskOwnerNameColIndex,
                        sortOrder: 'ASCENDING',
                    },
                ],
            },
        };
        await ToolsSheets.batchUpdateSheet(
            auth,
            [sortRequest],
            Setup.ScrumSheet.GdId
        );
    }

    static async getOwnerNameById(auth: OAuth2Client, id: number) {
        if (id) {
            const currentSprintValues = <any[][]>(
                await ToolsSheets.getValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                })
            ).values;
            const taskOwnerIdColIndex = currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskOwnerIdColName
            );
            const taskOwnerNameColIndex = currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskOwnerIdColName
            );

            const chosenOwnerDataSheeRow = Tools.findFirstInRange(
                id,
                currentSprintValues,
                taskOwnerIdColIndex
            );
            if (chosenOwnerDataSheeRow)
                return currentSprintValues[chosenOwnerDataSheeRow][
                    taskOwnerNameColIndex
                ];
        }
        return '';
    }

    static async makeTimesSummary(
        auth: OAuth2Client,
        persons?: Person[],
        currentSprintValues?: any[][]
    ) {
        if (!currentSprintValues) currentSprintValues = <any[][]>(
                await ToolsSheets.getValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                })
            ).values;

        const timesSummaryColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.timesSummaryColName
            ) + 1;
        const timesColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.timesColName
            ) + 1;
        if (!persons) persons = await ScrumSheet.scrumGetPersons();

        await ToolsSheets.deleteColumns(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            sheetId: Setup.ScrumSheet.CurrentSprint.id,
            startIndex: timesSummaryColNumber,
            endIndex: timesColNumber - 1,
        });
        await ToolsSheets.insertCols(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            sheetId: Setup.ScrumSheet.CurrentSprint.id,
            startIndex: timesSummaryColNumber,
            endIndex: timesSummaryColNumber + persons.length,
        });

        const formulas: any[][] = [
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
        ];
        const modeColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.modeColName
            ) + 1;

        await ToolsSheets.clearValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            range:
                `'${Setup.ScrumSheet.CurrentSprint.name}'!R${Setup.ScrumSheet.CurrentSprint.firstDataRow}C${timesSummaryColNumber}:` +
                `R${currentSprintValues.length}C${timesColNumber - 1}`,
        });
        this.printTimesDescriptionColumn(auth, timesSummaryColNumber);

        for (let i = 0; i < persons.length; i++) {
            let col = timesSummaryColNumber + i + 1;
            formulas[0].push(persons[i]._alias);

            formulas[1].push(
                this.timeLeftFormula(
                    Setup.ScrumSheet.CurrentSprint.firstDataRow - 2,
                    col,
                    modeColNumber
                )
            );

            //---------------zaplanowane czasy
            formulas[2].push(this.timesPlanned(i));

            formulas[3].push(
                `=SUM(${ToolsSheets.R1C1toA1(
                    Setup.ScrumSheet.CurrentSprint.firstDataRow,
                    timesColNumber + i
                )}:` +
                    `${ToolsSheets.R1C1toA1(
                        currentSprintValues.length,
                        timesColNumber + i
                    )})`
            );
            //ustaw czasy dzienne każdej osobie
            for (var j = 4; j <= 8; j++)
                formulas[j].push(
                    await this.scrumDailyWorkouts(
                        auth,
                        `${persons[i].name} ${persons[i].surname}`,
                        j,
                        currentSprintValues
                    )
                );

            const meetings = `=SUM(planowanie!E${i + 3}:G${i + 3})`;
            //---------------= SUM(${r1}C:R[-1]C)
            formulas[9].push(meetings);

            let r1 = Setup.ScrumSheet.CurrentSprint.firstDataRow + 1;
            //---------------
            formulas[10].push(
                `=SUM(` +
                    `${ToolsSheets.R1C1toA1(r1, col)}:` +
                    `${ToolsSheets.R1C1toA1(10, col)})`
            );

            r1 = Setup.ScrumSheet.CurrentSprint.firstDataRow - 1;
            //`= R${ r1 } C - R[-1]C`
            const diff =
                `= ${ToolsSheets.R1C1toA1(r1, col)}-` +
                `${ToolsSheets.R1C1toA1(r1 - 1, col)}`;
            formulas[11].push(diff);
        }

        ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${
                Setup.ScrumSheet.CurrentSprint.name
            }'!${ToolsSheets.R1C1toA1(1, timesSummaryColNumber + 1)}`,
            values: formulas,
        });
    }
    private static printTimesDescriptionColumn(
        auth: OAuth2Client,
        timesSummaryColNumber: number
    ) {
        const desciptions = [
            [
                'POZOSTAŁO',
                'Cz. dost. og.',
                'Przypisano',
                'PON.',
                'WT.',
                'ŚR.',
                'CZW.',
                'PT.',
                'spotk',
                'Razem',
                'CZ. PRACY',
            ],
        ];
        ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `'${
                Setup.ScrumSheet.CurrentSprint.name
            }'!${ToolsSheets.R1C1toA1(
                Setup.ScrumSheet.CurrentSprint.firstDataRow - 2,
                timesSummaryColNumber
            )}`,
            values: desciptions,
            majorDimension: 'COLUMNS',
        });
    }

    private static timeLeftFormula(
        row: number,
        col: number,
        modeColNumber: number
    ) {
        //'=IF(R1C' + modeColNumber + '="Planowanie"; R[1]C-R[2]C;R[1]C-R[9]C)'
        return (
            `=IF(${ToolsSheets.R1C1toA1(
                1,
                modeColNumber + 1,
                'RC'
            )}="Planowanie";` +
            `${ToolsSheets.R1C1toA1(row + 1, col)}-${ToolsSheets.R1C1toA1(
                row + 2,
                col
            )};` +
            `${ToolsSheets.R1C1toA1(row + 1, col)}-${ToolsSheets.R1C1toA1(
                row + 9,
                col
            )})`
        );
    }

    private static timesPlanned(personIndex: number) {
        return `=planowanie!H${personIndex + 3}`;
    }

    static async scrumDailyWorkouts(
        auth: OAuth2Client,
        personName: string,
        dayShift: number,
        currentSprintValues?: any[][]
    ) {
        if (!currentSprintValues) currentSprintValues = <any[][]>(
                await ToolsSheets.getValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                })
            ).values;
        const cAllPersons = currentSprintValues[1].indexOf(
            Setup.ScrumSheet.CurrentSprint.monColName
        );
        const cDay =
            currentSprintValues[1].indexOf(
                Setup.ScrumSheet.CurrentSprint.monColName
            ) -
            3 +
            dayShift;

        //=SUMIF(R4C-1:R295C-1;"=";R4C0:R295C0)
        const formula =
            `=SUMIF(` +
            `${ToolsSheets.R1C1toA1(
                Setup.ScrumSheet.CurrentSprint.firstDataRow,
                cAllPersons
            )}:${ToolsSheets.R1C1toA1(
                currentSprintValues.length,
                cAllPersons
            )};` +
            `"=${personName}";` +
            `${ToolsSheets.R1C1toA1(
                Setup.ScrumSheet.CurrentSprint.firstDataRow,
                cDay
            )}:${ToolsSheets.R1C1toA1(currentSprintValues.length, cDay)}` +
            `)`;
        return formula;
    }

    static async makePersonTimePerTaskFormulas(
        auth: OAuth2Client,
        persons?: Person[],
        currentSprintValues?: any[][]
    ) {
        if (!currentSprintValues) currentSprintValues = <any[][]>(
                await ToolsSheets.getValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: Setup.ScrumSheet.CurrentSprint.name,
                })
            ).values;

        if (!persons) persons = await ScrumSheet.scrumGetPersons();

        const timesColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.timesColName
        );
        const formulaRequests = [];
        for (let i = 0; i < persons.length; i++) {
            formulaRequests.push({
                range: {
                    startRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
                    endRowIndex: currentSprintValues.length,
                    startColumnIndex: timesColIndex + i,
                    endColumnIndex: timesColIndex + i + 1,
                },
                formula: this.personTimePerTaskFormula(
                    currentSprintValues,
                    Setup.ScrumSheet.CurrentSprint.firstDataRow + 1,
                    persons[i]
                ),
            });
        }

        await ToolsSheets.repeatFormulas(auth, {
            sheetId: Setup.ScrumSheet.CurrentSprint.id,
            spreadsheetId: Setup.ScrumSheet.GdId,
            formulaRequests,
        });
    }

    private static personTimePerTaskFormula(
        currentSprintValues: any[][],
        row: number,
        person: Person
    ) {
        //=IF(AND(($R4="Sylwia Kulczycka");($O4<>""));IF(OR($Q4="Zrobiony";$Q4="Oczekiwanie na odpowiedź - ONI";$Q4="Do weryfikacji - ONI");$X4;MAX($P4;$X4));"")
        //=IF(
        //AND(($R4="Sylwia Kulczycka");($O4<>""));
        //IF(OR($Q4="Zrobiony";$Q4="Oczekiwanie na odpowiedź");
        //$X4;MAX($P4;$X4));""
        //)
        const personColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskOwnerNameColName
            ) + 1;
        const personA1 = ToolsSheets.R1C1toA1(row, personColNumber, 'C');

        const deadlineColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskDeadlineColName
            ) + 1;
        const deadlineA1 = ToolsSheets.R1C1toA1(row, deadlineColNumber, 'C');

        const statusColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskStatusColName
            ) + 1;
        const statusA1 = ToolsSheets.R1C1toA1(row, statusColNumber, 'C');

        const estimatedTimeColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.taskEstimatedTimeColName
            ) + 1;
        const estimatedTimeA1 = ToolsSheets.R1C1toA1(
            row,
            estimatedTimeColNumber,
            'C'
        );

        const sprintSumColNumber =
            currentSprintValues[1].indexOf(
                Setup.ScrumSheet.CurrentSprint.sprintSumColName
            ) + 1;
        const sprintSumA1 = ToolsSheets.R1C1toA1(row, sprintSumColNumber, 'C');

        const nameSurname = `${person.name} ${person.surname}`;
        return (
            `=IF(` +
            `AND((${personA1}="${nameSurname}");(${deadlineA1}<>""));` +
            `IF(OR(${statusA1}="Zrobiony"; ${statusA1}="Oczekiwanie na odpowiedź");${sprintSumA1}; MAX(${estimatedTimeA1}; ${sprintSumA1}));` +
            `"")`
        );
    }
}
