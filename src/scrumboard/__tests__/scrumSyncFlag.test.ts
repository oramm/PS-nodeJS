/**
 * Weryfikacja flagi SCRUM_SHEET_SYNC_ENABLED na najtrudniejszym przypadku:
 * Case.editInScrum pisze do DWÓCH arkuszy — "dane" (ma działać zawsze) i
 * "aktualny sprint" (ma być wyłączony przy fladze off).
 * Ciężkie zależności mockujemy fabrykami, żeby ts-jest nie kompilował głębokiego grafu
 * i żeby nie dotykać DB/Google.
 */
jest.mock('googleapis', () => ({ google: { sheets: jest.fn(), drive: jest.fn() } }));
jest.mock('../../ScrumSheet/CurrentSprint', () => ({
    __esModule: true,
    default: { deleteRowsByColValue: jest.fn() },
}));
jest.mock('../../contracts/milestones/cases/tasks/taskTemplates/TaskTemplatesController', () => ({
    __esModule: true,
    default: {},
}));
jest.mock('../../tools/ToolsGd', () => ({
    __esModule: true,
    default: { createGdFolderUrl: jest.fn(() => '') },
}));
jest.mock('../../tools/ToolsSheets', () => ({
    __esModule: true,
    default: {
        getValues: jest.fn(),
        updateValues: jest.fn(),
        deleteRows: jest.fn(),
        R1C1toA1: jest.fn(() => 'A1'),
    },
}));

import Setup from '../../setup/Setup';
import ToolsSheets from '../../tools/ToolsSheets';
import Case from '../../contracts/milestones/cases/Case';

const DATA = Setup.ScrumSheet.Data.name;
const SPRINT = Setup.ScrumSheet.CurrentSprint.name;

function makeCase(): any {
    const c = Object.create(Case.prototype);
    Object.assign(c, {
        id: 1,
        typeId: 5,
        milestoneId: 10,
        name: 'Test',
        gdFolderId: '',
        _gdFolderUrl: '',
        _type: { folderNumber: '1', name: 'Typ' },
        _displayNumber: '1',
    });
    return c;
}

function readRanges(): string[] {
    return (ToolsSheets.getValues as jest.Mock).mock.calls.map((c) => c[1].rangeA1);
}

beforeEach(() => {
    (ToolsSheets.getValues as jest.Mock).mockImplementation(async (_auth, { rangeA1 }) => {
        if (rangeA1 === DATA)
            return { values: [[Setup.ScrumSheet.Data.caseIdColName], [1]] };
        return {
            values: [
                [
                    Setup.ScrumSheet.CurrentSprint.milestoneIdColName,
                    Setup.ScrumSheet.CurrentSprint.caseTypeColName,
                ],
            ],
        };
    });
});

describe('SCRUM_SHEET_SYNC_ENABLED', () => {
    afterEach(() => {
        delete process.env.SCRUM_SHEET_SYNC_ENABLED;
    });

    it('getter odzwierciedla zmienną środowiskową', () => {
        process.env.SCRUM_SHEET_SYNC_ENABLED = 'false';
        expect(Setup.scrumSheetSyncEnabled).toBe(false);
        process.env.SCRUM_SHEET_SYNC_ENABLED = 'true';
        expect(Setup.scrumSheetSyncEnabled).toBe(true);
        delete process.env.SCRUM_SHEET_SYNC_ENABLED;
        expect(Setup.scrumSheetSyncEnabled).toBe(true); // domyślnie włączona
    });

    it('flaga OFF: pisze do "dane", NIE rusza "aktualnego sprintu"', async () => {
        process.env.SCRUM_SHEET_SYNC_ENABLED = 'false';
        await makeCase().editInScrum({} as any);

        expect(readRanges()).toContain(DATA); // arkusz "dane" odczytany
        expect(readRanges()).not.toContain(SPRINT); // "aktualny sprint" pominięty
        expect(ToolsSheets.updateValues).toHaveBeenCalled(); // zapis do "dane" wykonany
    });

    it('flaga ON: rusza także "aktualny sprint"', async () => {
        process.env.SCRUM_SHEET_SYNC_ENABLED = 'true';
        await makeCase().editInScrum({} as any);

        expect(readRanges()).toContain(DATA);
        expect(readRanges()).toContain(SPRINT); // przy fladze on sprint jest odczytywany
    });
});
