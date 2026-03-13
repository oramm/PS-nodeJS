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
