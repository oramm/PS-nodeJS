import ApprovedDocsController, {
    buildSprawaRichText,
} from '../ApprovedDocsController';
import ToolsGd from '../../../../tools/ToolsGd';
import ToolsSheets from '../../../../tools/ToolsSheets';
import Setup from '../../../../setup/Setup';

const mockAuth = { mocked: true } as any;

const designSupervisionMilestone = (overrides: any = {}) =>
    ({
        id: 10,
        typeId: Setup.MilestoneTypes.DESIGN_SUPERVISION,
        gdFolderId: 'milestone-folder',
        _contract: { id: 1, approvedDocumentation: true },
        ...overrides,
    } as any);

const spreadsheetMeta = {
    data: { sheets: [{ properties: { title: 'Arkusz1', sheetId: 55 } }] },
} as any;

describe('ApprovedDocsController', () => {
    afterEach(() => jest.restoreAllMocks());

    describe('isApplicable', () => {
        it('true dla kamienia typu 6 z flagą kontraktu', () => {
            expect(
                ApprovedDocsController.isApplicable(designSupervisionMilestone())
            ).toBe(true);
        });

        it('false gdy kontrakt nie ma flagi', () => {
            expect(
                ApprovedDocsController.isApplicable(
                    designSupervisionMilestone({
                        _contract: { id: 1, approvedDocumentation: false },
                    })
                )
            ).toBe(false);
        });

        it('false gdy inny typ kamienia', () => {
            expect(
                ApprovedDocsController.isApplicable(
                    designSupervisionMilestone({ typeId: 1 })
                )
            ).toBe(false);
        });
    });

    describe('ensureFolderAndSheet', () => {
        it('tworzy folder, arkusz, nagłówek i formatowanie gdy arkusza brak', async () => {
            const setFolder = jest
                .spyOn(ToolsGd, 'setFolder')
                .mockResolvedValue({ id: 'folder-04' } as any);
            jest.spyOn(ToolsGd, 'getFileMetaDataByNameAndMimeType').mockResolvedValue(
                undefined as any
            );
            const createFile = jest
                .spyOn(ToolsGd, 'createNativeFile')
                .mockResolvedValue({ id: 'sheet-1' } as any);
            const updateValues = jest
                .spyOn(ToolsSheets, 'updateValues')
                .mockResolvedValue({} as any);
            jest.spyOn(ToolsSheets, 'getSpreadSheet').mockResolvedValue(
                spreadsheetMeta
            );
            const batchUpdate = jest
                .spyOn(ToolsSheets, 'batchUpdateSheet')
                .mockResolvedValue({} as any);

            const result = await ApprovedDocsController.ensureFolderAndSheet(
                mockAuth,
                designSupervisionMilestone()
            );

            expect(setFolder).toHaveBeenCalledWith(mockAuth, {
                parentId: 'milestone-folder',
                name: Setup.ApprovedDocumentation.folderName,
            });
            expect(createFile).toHaveBeenCalled();
            expect(updateValues).toHaveBeenCalledWith(mockAuth, {
                spreadsheetId: 'sheet-1',
                rangeA1: 'A1',
                values: [Setup.ApprovedDocumentation.header],
            });
            expect(batchUpdate).toHaveBeenCalled(); // formatowanie nagłówka
            const formatReqs = batchUpdate.mock.calls[0][1] as any[];
            expect(formatReqs.some((r) => r.setBasicFilter)).toBe(true);
            const validation = formatReqs.find((r) => r.setDataValidation);
            expect(validation.setDataValidation.rule.strict).toBe(false);
            expect(
                validation.setDataValidation.rule.condition.values.map(
                    (v: any) => v.userEnteredValue
                )
            ).toEqual(['pismo', 'mail']);
            expect(result).toEqual({
                folderId: 'folder-04',
                spreadsheetId: 'sheet-1',
                sheetTabName: 'Arkusz1',
                sheetId: 55,
            });
        });

        it('idempotentne: istniejący arkusz nie jest tworzony, formatowany ani nadpisywany', async () => {
            jest.spyOn(ToolsGd, 'setFolder').mockResolvedValue({
                id: 'folder-04',
            } as any);
            jest.spyOn(ToolsGd, 'getFileMetaDataByNameAndMimeType').mockResolvedValue(
                { id: 'sheet-existing' } as any
            );
            const createFile = jest.spyOn(ToolsGd, 'createNativeFile');
            const updateValues = jest.spyOn(ToolsSheets, 'updateValues');
            const batchUpdate = jest.spyOn(ToolsSheets, 'batchUpdateSheet');
            jest.spyOn(ToolsSheets, 'getSpreadSheet').mockResolvedValue(
                spreadsheetMeta
            );

            const result = await ApprovedDocsController.ensureFolderAndSheet(
                mockAuth,
                designSupervisionMilestone()
            );

            expect(createFile).not.toHaveBeenCalled();
            expect(updateValues).not.toHaveBeenCalled();
            expect(batchUpdate).not.toHaveBeenCalled();
            expect(result).toEqual({
                folderId: 'folder-04',
                spreadsheetId: 'sheet-existing',
                sheetTabName: 'Arkusz1',
                sheetId: 55,
            });
        });

        it('rzuca dla kamienia innego typu niż projektowanie-nadzór', async () => {
            await expect(
                ApprovedDocsController.ensureFolderAndSheet(
                    mockAuth,
                    designSupervisionMilestone({ typeId: 1 })
                )
            ).rejects.toThrow();
        });
    });

    describe('registerLetter', () => {
        const mockSheetExists = () => {
            jest.spyOn(ToolsGd, 'setFolder').mockResolvedValue({
                id: 'folder-04',
            } as any);
            jest.spyOn(ToolsGd, 'getFileMetaDataByNameAndMimeType').mockResolvedValue(
                { id: 'sheet-1' } as any
            );
            jest.spyOn(ToolsSheets, 'getSpreadSheet').mockResolvedValue(
                spreadsheetMeta
            );
        };

        it('dopisuje wiersz z Lp/Dotyczy/Sprawa i hiperłącza spraw', async () => {
            mockSheetExists();
            jest.spyOn(ToolsSheets, 'getValues').mockResolvedValue({
                values: [Setup.ApprovedDocumentation.header],
            } as any);
            const createShortcut = jest
                .spyOn(ToolsGd, 'createShortcut')
                .mockResolvedValue({} as any);
            const appendRows = jest
                .spyOn(ToolsSheets, 'appendRowsToSpreadSheet')
                .mockResolvedValue({
                    data: { updates: { updatedRange: 'Arkusz1!A2:G2' } },
                } as any);
            const batchUpdate = jest
                .spyOn(ToolsSheets, 'batchUpdateSheet')
                .mockResolvedValue({} as any);

            const letter = {
                number: 123,
                description: 'Opis pisma',
                gdDocumentId: 'doc-1',
                creationDate: '2026-07-22',
                _cases: [{ name: 'Sprawa A', gdFolderId: 'cf1' }],
            } as any;

            await ApprovedDocsController.registerLetter(
                mockAuth,
                designSupervisionMilestone(),
                letter
            );

            expect(createShortcut).toHaveBeenCalledWith(mockAuth, {
                targetId: 'doc-1',
                parentId: 'folder-04',
                name: '123 Opis pisma',
            });
            expect(appendRows).toHaveBeenCalledWith(mockAuth, {
                spreadsheetId: 'sheet-1',
                sheetName: 'Arkusz1',
                values: [
                    [
                        1,
                        '2026-07-22',
                        'pismo',
                        123,
                        'Opis pisma',
                        'Sprawa A',
                        'https://drive.google.com/open?id=doc-1',
                    ],
                ],
            });
            // rich-text hiperłącze w kolumnie „Sprawa” dopisanego wiersza
            expect(batchUpdate).toHaveBeenCalled();
            const reqs = batchUpdate.mock.calls[0][1] as any[];
            // wiersz odbolduje wartości
            expect(
                reqs.some(
                    (r) => r.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold === false
                )
            ).toBe(true);
            const richText = reqs.find((r) => r.updateCells);
            expect(richText.updateCells.start).toEqual({
                sheetId: 55,
                rowIndex: 1,
                columnIndex: 5,
            });
            // Link (druga komórka, kolumna G) dostaje jawny hiperłącze
            const linkCell = richText.updateCells.rows[0].values[1];
            expect(linkCell.textFormatRuns[0].format.link.uri).toBe(
                'https://drive.google.com/open?id=doc-1'
            );
        });

        it('idempotentne: nie dubluje wpisu, gdy pismo już jest w rejestrze', async () => {
            mockSheetExists();
            jest.spyOn(ToolsSheets, 'getValues').mockResolvedValue({
                values: [
                    Setup.ApprovedDocumentation.header,
                    [1, '2026-07-22', 'pismo', 123, 'Opis', 'Sprawa A', 'url'],
                ],
            } as any);
            const createShortcut = jest.spyOn(ToolsGd, 'createShortcut');
            const appendRows = jest.spyOn(ToolsSheets, 'appendRowsToSpreadSheet');

            await ApprovedDocsController.registerLetter(
                mockAuth,
                designSupervisionMilestone(),
                {
                    number: 123,
                    description: 'Opis',
                    gdDocumentId: 'doc-1',
                    creationDate: '2026-07-22',
                    _cases: [{ name: 'Sprawa A', gdFolderId: 'cf1' }],
                } as any
            );

            expect(createShortcut).not.toHaveBeenCalled();
            expect(appendRows).not.toHaveBeenCalled();
        });
    });

    describe('buildSprawaRichText', () => {
        it('łączy etykiety i linkuje każdą sprawę osobno', () => {
            const { text, runs } = buildSprawaRichText([
                { name: 'A', gdFolderId: 'f1' },
                { name: 'B', gdFolderId: 'f2' },
            ] as any);

            expect(text).toBe('A, B');
            expect(runs).toEqual([
                {
                    startIndex: 0,
                    format: {
                        link: { uri: 'https://drive.google.com/drive/folders/f1' },
                    },
                },
                { startIndex: 1, format: {} },
                {
                    startIndex: 3,
                    format: {
                        link: { uri: 'https://drive.google.com/drive/folders/f2' },
                    },
                },
            ]);
        });
    });
});
