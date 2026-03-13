import ToolsDocs from '../ToolsDocs';

describe('ToolsDocs', () => {
    const makeDocument = (textRuns: string[]) => ({
        body: {
            content: textRuns.map((text, index) => ({
                startIndex: index * 10 + 1,
                endIndex: index * 10 + 1 + text.length,
                paragraph: {
                    elements: [
                        {
                            startIndex: index * 10 + 1,
                            endIndex: index * 10 + 1 + text.length,
                            textRun: { content: text },
                        },
                    ],
                },
            })),
        },
    });

    it('getTagsForNamedRanges recognizes valid ENVI tags', () => {
        const document = makeDocument([
            '#ENVI#creationDate#\n',
            '#ENVI#projectContext#\n',
            '#ENVI#addressCc#\n',
            '#ENVI#employerName#\n',
            '#ENVI#MEETING_TITLE#\n',
            '#ENVI#AGENDA_SECTION#\n',
            '#ENVI#EMPLOYERS#\n',
            '#ENVI#ENGINEERS#\n',
            '#ENVI#CONTRACTORS#\n',
        ]) as any;

        expect(ToolsDocs.getTagsForNamedRanges(document)).toEqual([
            'creationDate',
            'projectContext',
            'addressCc',
            'employerName',
            'MEETING_TITLE',
            'AGENDA_SECTION',
            'EMPLOYERS',
            'ENGINEERS',
            'CONTRACTORS',
        ]);
    });

    it('getTagsForNamedRanges supports mixed camelCase and uppercase tags', () => {
        const document = makeDocument([
            '#ENVI#creationDate#\n',
            '#ENVI#AGENDA_SECTION#\n',
            '#ENVI#addressCc#\n',
        ]) as any;

        expect(ToolsDocs.getTagsForNamedRanges(document)).toEqual([
            'creationDate',
            'AGENDA_SECTION',
            'addressCc',
        ]);
    });

    it('getTagsForNamedRanges ignores invalid placeholders', () => {
        const document = makeDocument(['#zmienna\n', '#ENVI#MEETING_TITLE#\n']) as any;

        expect(ToolsDocs.getTagsForNamedRanges(document)).toEqual([
            'MEETING_TITLE',
        ]);
    });

    it('getTagsForNamedRanges extracts tags embedded in surrounding text', () => {
        const document = makeDocument([
            'Kontrakt:\n#ENVI#CONTRACT_NUMBER# - \n',
            'Sporzadzil: #ENVI#CREATED_BY#\n',
        ]) as any;

        expect(ToolsDocs.getTagsForNamedRanges(document)).toEqual([
            'CONTRACT_NUMBER',
            'CREATED_BY',
        ]);
    });

    it('refreshNamedRangesFromTags creates ranges only for exact tag text', async () => {
        const document = makeDocument([
            'Label: #ENVI#CREATED_BY#\n',
            '#ENVI#CONTRACT_NUMBER# - \n',
        ]) as any;
        document.documentId = 'doc-1';
        document.namedRanges = {};

        jest.spyOn(ToolsDocs, 'getDocument').mockResolvedValue({
            data: document,
        } as any);
        const batchUpdateSpy = jest
            .spyOn(ToolsDocs as any, 'batchUpdateDocument')
            .mockResolvedValue(undefined);

        await ToolsDocs.refreshNamedRangesFromTags({} as any, 'doc-1');

        expect(batchUpdateSpy).toHaveBeenCalledWith(
            {} as any,
            [
                {
                    createNamedRange: {
                        name: 'CREATED_BY',
                        range: {
                            startIndex: 8,
                            endIndex: 25,
                        },
                    },
                },
                {
                    createNamedRange: {
                        name: 'CONTRACT_NUMBER',
                        range: {
                            startIndex: 11,
                            endIndex: 33,
                        },
                    },
                },
            ],
            'doc-1',
        );
    });

    it('updateTextRunInNamedRange skips insertText when replacement text is empty', async () => {
        const document = makeDocument(['Sporzadzil: #ENVI#CREATED_BY#\n']) as any;
        document.documentId = 'doc-1';
        const batchUpdateSpy = jest
            .spyOn(ToolsDocs as any, 'batchUpdateDocument')
            .mockResolvedValue(undefined);

        await ToolsDocs.updateTextRunInNamedRange(
            {} as any,
            document,
            {
                name: 'CREATED_BY',
                ranges: [{ startIndex: 13, endIndex: 30 }],
            } as any,
            '',
        );

        expect(batchUpdateSpy).toHaveBeenCalledWith(
            {} as any,
            [
                {
                    deleteContentRange: {
                        range: {
                            startIndex: 13,
                            endIndex: 30,
                        },
                    },
                },
                {
                    deleteNamedRange: {
                        name: 'CREATED_BY',
                    },
                },
            ],
            'doc-1',
        );
    });

    it('insertAgendaStructure deletes the whole AGENDA_SECTION placeholder without leaving trailing hash', async () => {
        const document = makeDocument(['#ENVI#AGENDA_SECTION#\n']) as any;
        document.documentId = 'doc-1';
        document.namedRanges = {
            AGENDA_SECTION: {
                namedRanges: [
                    {
                        name: 'AGENDA_SECTION',
                        ranges: [{ startIndex: 1, endIndex: 22 }],
                    },
                ],
            },
        };
        jest.spyOn(ToolsDocs, 'getDocument').mockResolvedValue({
            data: document,
        } as any);
        const batchUpdateSpy = jest
            .spyOn(ToolsDocs as any, 'batchUpdateDocument')
            .mockResolvedValue(undefined);

        await ToolsDocs.insertAgendaStructure({} as any, 'doc-1', [
            { heading: '00 Umowa ENVI', body: 'gtest' },
        ]);

        expect(batchUpdateSpy).toHaveBeenCalledWith(
            {} as any,
            expect.arrayContaining([
                {
                    deleteContentRange: {
                        range: {
                            startIndex: 1,
                            endIndex: 22,
                        },
                    },
                },
            ]),
            'doc-1',
        );
    });

    it('templateContainsNamedRangeTag matches supported ENVI formats', () => {
        expect(
            ToolsDocs.templateContainsNamedRangeTag('#ENVI#creationDate#'),
        ).toBe(true);
        expect(
            ToolsDocs.templateContainsNamedRangeTag('#ENVI#projectContext#'),
        ).toBe(true);
        expect(
            ToolsDocs.templateContainsNamedRangeTag('#ENVI#addressCc#'),
        ).toBe(true);
        expect(
            ToolsDocs.templateContainsNamedRangeTag('#ENVI#employerName#'),
        ).toBe(true);
        expect(
            ToolsDocs.templateContainsNamedRangeTag('#ENVI#MEETING_TITLE#'),
        ).toBe(true);
        expect(ToolsDocs.templateContainsNamedRangeTag('#ENVI#AGENDA_SECTION#')).toBe(
            true,
        );
        expect(ToolsDocs.templateContainsNamedRangeTag('#ENVI#EMPLOYERS#')).toBe(
            true,
        );
        expect(ToolsDocs.templateContainsNamedRangeTag('#ENVI#ENGINEERS#')).toBe(
            true,
        );
        expect(ToolsDocs.templateContainsNamedRangeTag('#ENVI#CONTRACTORS#')).toBe(
            true,
        );
        expect(ToolsDocs.templateContainsNamedRangeTag('#zmienna')).toBe(false);
        expect(ToolsDocs.templateContainsNamedRangeTag('#ENVI#bad tag#')).toBe(
            false,
        );
    });
});
