import { OAuth2Client } from 'google-auth-library';
import { docs_v1, google } from 'googleapis';
import Tools from './Tools';

export default class ToolsDocs {
    static async getDocument(auth: OAuth2Client, documentId: string) {
        const docs = google.docs({ version: 'v1', auth });
        return await docs.documents.get({ auth, documentId });
    }
    /**Tworzy nowe NamedRanges - uywać tylko przy inicjaji, bo wykasuje istniejące NamedRanges
     * https://developers.google.com/docs/api/samples/output-json?hl=en
     */
    static async initNamedRangesFromTags(
        auth: OAuth2Client,
        documentId: string,
    ) {
        const document = (await this.getDocument(auth, documentId)).data;
        const tags = this.getTagsForNamedRanges(document);
        if (!tags.length) throw new Error('No tags for namedRanges found');

        await this.clearNamedRanges(auth, documentId);
        const namedRangesCreated = await this.refreshNamedRangesFromTags(
            auth,
            documentId,
        );
        return namedRangesCreated;
    }
    /**Tworzy nowe NamedRanges z tagów z szablonu - używać do uzupełniania namedRanges w dokumentcie
     * Nie usuwa istniejących NamedRanges i nie nadpisuje ich
     * https://developers.google.com/docs/api/samples/output-json?hl=en
     */
    static async refreshNamedRangesFromTags(
        auth: OAuth2Client,
        documentId: string,
    ) {
        console.group('---refreshNamedRangesFromTags::');
        const document = (await this.getDocument(auth, documentId)).data;
        if (!document || !document.body || !document.body.content)
            throw new Error('No template document found or template empty');

        const content = document.body.content;

        let requests: docs_v1.Schema$Request[] = [];
        const paragraphs = this.getAllParagraphElementsFromDocument(content);
        paragraphs.forEach((element) => {
            if (element.paragraph) {
                const request = this.createNameRangeRequestFromTextRun(
                    element.paragraph,
                );
                const name = request?.createNamedRange?.name;
                let namedRange;
                if (request && name) {
                    console.log(
                        `RangeName:: ${name}, s-e: ${request.createNamedRange?.range?.startIndex}-${request.createNamedRange?.range?.endIndex}`,
                    );
                    namedRange = this.getNamedRangeByName(document, name);
                    if (!namedRange) requests.push(request);
                }
            }
        });

        if (!requests.length) return;
        // Wyslij prośby o utworzenie namedRange
        await this.batchUpdateDocument(auth, requests, documentId);
        console.groupEnd();
        return requests.length > 0;
    }

    private static createNameRangeRequestFromTextRun(
        paragraph: docs_v1.Schema$Paragraph,
    ): docs_v1.Schema$Request | undefined {
        const textElements = paragraph.elements;
        const requests = [];
        if (textElements)
            for (const textElement of textElements) {
                const namedRangeRegex = /#ENVI#[aA-zZ|\s]+#/;
                const textRunContent = textElement.textRun?.content;
                if (textRunContent && namedRangeRegex.test(textRunContent)) {
                    if (textElement.startIndex) {
                        const namedRangeName =
                            this.templateTagToRangeName(textRunContent);
                        return {
                            createNamedRange: {
                                name: namedRangeName,
                                range: {
                                    startIndex: textElement.startIndex,
                                    endIndex: textElement.endIndex,
                                },
                            },
                        };
                    }
                }
            }
    }

    /** Wypełnia wszystie namedRanges w dokumentcie nową treścią */
    static async updateTextRunsInNamedRanges(
        auth: OAuth2Client,
        documentId: string,
        newData: { rangeName: string; newText: string }[],
    ) {
        const notMatchedData = [...newData];
        const document = (await this.getDocument(auth, documentId)).data;

        if (document.namedRanges) {
            //this.sortNamedRangesDescending() zwraca nową tablicę posortowaną
            const namedRangesSorted = this.sortNamedRangesDescending(
                document.namedRanges,
            );
            console.log(`updateTextRunsInNamedRanges:: sortedNamedRanges:`);
            for (const sharingNameNamedRanges of namedRangesSorted) {
                for (const dataElement of newData) {
                    //jeśli obiekt w data pasuje do jednego z namedRange.name - usuń go z notMatchedData
                    if (
                        sharingNameNamedRanges.name == dataElement.rangeName &&
                        sharingNameNamedRanges.namedRanges
                    ) {
                        const index = notMatchedData.findIndex(
                            (obj) => obj.rangeName === dataElement.rangeName,
                        );
                        notMatchedData.splice(index, 1);
                        console.log(
                            `updateTextRunInNamedRange(${sharingNameNamedRanges.namedRanges[0].name},${dataElement.newText})`,
                        );
                        console.group();
                        await this.updateTextRunInNamedRange(
                            auth,
                            document,
                            sharingNameNamedRanges.namedRanges[0],
                            dataElement.newText,
                        );
                        console.groupEnd();
                        console.log(
                            `updateTextRunInNamedRange(${sharingNameNamedRanges.namedRanges[0].name},${dataElement.newText}) DONE`,
                        );
                        continue;
                    }
                }
            }
            if (notMatchedData.length > 0)
                console.log(
                    'Some tags did not match any of namedRanges %o:',
                    notMatchedData,
                );
        }
    }

    /** Wypełnia pojedynczy textRun na który wskazuje namedRange */
    static async updateTextRunInNamedRange(
        auth: OAuth2Client,
        document: docs_v1.Schema$Document,
        namedRange: docs_v1.Schema$NamedRange,
        newText: string,
        style?: docs_v1.Schema$TextStyle,
    ) {
        if (!document.body?.content)
            throw new Error(
                `Document ${document.title} has no content: ${namedRange.name}`,
            );
        if (
            !namedRange.ranges ||
            !namedRange.ranges[0].startIndex ||
            !namedRange.ranges[0].endIndex
        )
            throw new Error(
                `NamedRange ${namedRange.name} is not attached to document`,
            );
        const startIndex = namedRange.ranges[0].startIndex;
        const endIndex = namedRange.ranges[0].endIndex;
        const allParagraphs = this.getAllParagraphElementsFromDocument(
            document.body.content,
        );
        const textRunAndParenElement = this.getTextRunsAndParagraphElement(
            allParagraphs,
            startIndex,
            endIndex,
        );
        const textRunElements = textRunAndParenElement?.textRunElements;
        if (!textRunElements) {
            console.log(
                'textRunAndParenElement?.parentElement %o',
                textRunAndParenElement?.parentElements,
            );
            console.log('namedRange %o', namedRange);
            throw new Error(
                `No textRun found for namedRange: ${namedRange.name}`,
            );
        }

        const requestIndexes = this.setUpdateNamedRangeIndexes(
            textRunAndParenElement.parentElements,
            textRunElements,
            startIndex,
            endIndex,
        );

        this.LogInConsoleParagraphsAndTextruns(
            requestIndexes,
            textRunAndParenElement,
        );

        const requests = this.makeTextRunUpdateRequests(
            requestIndexes,
            newText,
            <string>namedRange.name,
            style,
        );
        try {
            // Wprowadź tekst i style
            await this.batchUpdateDocument(
                auth,
                requests,
                <string>document.documentId,
            );
        } catch (error) {
            console.log(JSON.stringify(requests));
            throw error;
        }
    }
    /**Używana w updateTextRunInNamedRange() */
    private static LogInConsoleParagraphsAndTextruns(
        requestIndexes: {
            namedRangeStartIndex: number;
            namedRangeEndIndex: number;
            deleteStartIndex: number;
            deleteEndIndex: number;
        },
        textRunAndParenElement: {
            textRunElements: docs_v1.Schema$ParagraphElement[];
            parentElements: docs_v1.Schema$StructuralElement[];
        },
    ) {
        const paragraphs: any = {};
        for (let i = 0; i < textRunAndParenElement.parentElements.length; i++) {
            const paragraph =
                textRunAndParenElement.parentElements[i].paragraph;
            if (paragraph) {
                paragraphs[`paragraph${i}`] = {
                    startIndex:
                        textRunAndParenElement.parentElements[i].startIndex,
                    endIndex: textRunAndParenElement.parentElements[i].endIndex,
                    content: paragraph.elements?.map(
                        (element) => `[${element.textRun?.content}] `,
                    ),
                };
            }
        }

        console.table({
            namedRange: {
                startIndex: requestIndexes.namedRangeStartIndex,
                endIndex: requestIndexes.namedRangeEndIndex,
            },
            ...paragraphs,
        });
    }

    /**
     * Jeżeli po skasowaniu wybranych Texrunów paragraf nie będzie zawierał na końcu znaku '\n' trzeba w paragrafi zostawić co najmniej
     * jeden textrun ze znaiem '\n'
     */
    private static setUpdateNamedRangeIndexes(
        parentParagraphs: docs_v1.Schema$StructuralElement[],
        affectedTextRunElements: docs_v1.Schema$ParagraphElement[],
        namedRangeStartIndex: number,
        namedRangeEndIndex: number,
    ) {
        const indexes = {
            namedRangeStartIndex,
            namedRangeEndIndex,
            deleteStartIndex: namedRangeStartIndex,
            deleteEndIndex: namedRangeEndIndex,
        };
        let allParentParagraphsTextRuns: docs_v1.Schema$ParagraphElement[] = [];

        parentParagraphs.forEach((paragraphElement) => {
            if (paragraphElement?.paragraph?.elements)
                allParentParagraphsTextRuns =
                    allParentParagraphsTextRuns.concat(
                        paragraphElement?.paragraph?.elements,
                    );
        });

        if (!allParentParagraphsTextRuns) throw new Error('Paragraph is empty');
        allParentParagraphsTextRuns = allParentParagraphsTextRuns.filter(
            (element) => element.textRun,
        );

        const paragraphMergedContent: string = allParentParagraphsTextRuns
            .map((element) => {
                return element.textRun?.content ? element.textRun?.content : '';
            })
            .join('');

        //zakładam, że zawsze pierwszy Paragraph w tablicy będzie z najmniejszym startIndex
        const firstParagraphstartIndex = parentParagraphs[0].startIndex;
        const startRelative =
            namedRangeStartIndex - <number>firstParagraphstartIndex;
        const endRelative =
            namedRangeEndIndex - <number>firstParagraphstartIndex;
        const paragraphOutsideMergedCOntent = Tools.getRemainingString(
            startRelative,
            endRelative,
            paragraphMergedContent,
        );

        const lastCharInParagraph =
            paragraphOutsideMergedCOntent[
                paragraphOutsideMergedCOntent.length - 1
            ];
        if (lastCharInParagraph !== '\n') indexes.deleteEndIndex--;

        return indexes;
    }

    private static makeTextRunUpdateRequests(
        requestIndexes: {
            namedRangeStartIndex: number;
            namedRangeEndIndex: number;
            deleteStartIndex: number;
            deleteEndIndex: number;
        },
        newText: string,
        rangeName: string,
        style: docs_v1.Schema$TextStyle | undefined,
    ) {
        const requests: docs_v1.Schema$Request[] = [];
        requests.push({
            deleteContentRange: {
                range: {
                    startIndex: requestIndexes.deleteStartIndex,
                    endIndex: requestIndexes.deleteEndIndex,
                },
            },
        });
        requests.push({
            insertText: {
                text: newText,
                location: {
                    index: requestIndexes.namedRangeStartIndex,
                },
            },
        });
        requests.push({
            deleteNamedRange: {
                name: rangeName,
            },
        });

        requests.push({
            createNamedRange: {
                name: rangeName,
                range: {
                    startIndex: requestIndexes.namedRangeStartIndex,
                    endIndex:
                        requestIndexes.namedRangeStartIndex + newText.length,
                },
            },
        });

        if (style) {
            requests.push({
                updateTextStyle: {
                    range: {
                        startIndex: requestIndexes.namedRangeStartIndex,
                        endIndex:
                            <number>requestIndexes.namedRangeStartIndex +
                            newText.length,
                    },
                    textStyle: style,
                    fields: '*',
                },
            });
        }
        return requests;
    }

    /**Usuwa NamedRanges
     * https://developers.google.com/docs/api/reference/rest/v1/documents#NamedRanges
     */
    static async clearNamedRanges(auth: OAuth2Client, documentId: string) {
        let document = (await this.getDocument(auth, documentId)).data;
        const requests: docs_v1.Schema$Request[] = [];

        if (document.namedRanges) {
            Object.values(document.namedRanges).forEach((namedRange) => {
                if (namedRange.namedRanges) {
                    requests.push({
                        deleteNamedRange: {
                            name: namedRange.namedRanges[0].name,
                        },
                    });
                }
            });
        }
        if (requests.length > 0)
            await this.batchUpdateDocument(
                auth,
                requests,
                <string>document.documentId,
            );
        return document.namedRanges;
    }

    /** Returns ranges names array by fetching template for namedRanges Tags #ENVI# */
    static getTagsForNamedRanges(document: docs_v1.Schema$Document) {
        if (!document.body || !document.body.content)
            throw new Error('No template document found or template empty');
        const content = document.body.content;
        const paragraphElements =
            this.getAllParagraphElementsFromDocument(content);
        const foundTags: string[] = [];

        for (const element of paragraphElements) {
            const paragraph = element.paragraph;
            //pusty paragraf
            if (!paragraph?.elements) continue;
            //szukaj w textRunach
            for (const element of paragraph.elements) {
                const namedRangeRegex = /#ENVI#[aA-zZ|\s]+#/;
                const textRunContent = element.textRun?.content;
                if (textRunContent && namedRangeRegex.test(textRunContent)) {
                    foundTags.push(this.templateTagToRangeName(textRunContent));
                }
            }
        }
        return foundTags;
    }
    /**@deprecated */
    private static getlastTwoTextRunsFromTableCell(
        cell: docs_v1.Schema$TableCell,
    ) {
        let penultimateParagraph;
        let lastParagraph;
        let lastTextRun;
        let penultimateTextRun;

        if (cell.content && cell.content?.length >= 2) {
            for (let i = cell.content.length - 1; i === 0; i--) {
                lastParagraph = cell.content[i].paragraph;
                if (lastParagraph?.elements)
                    lastTextRun =
                        lastParagraph.elements[lastParagraph.elements.length]
                            .textRun;
                if (i) {
                    penultimateParagraph = cell.content[i - 1].paragraph;
                    if (penultimateParagraph?.elements)
                        penultimateTextRun =
                            penultimateParagraph.elements[
                                penultimateParagraph.elements.length
                            ].textRun;
                }
            }
        }
        return {
            penultimateParagraph,
            lastParagraph,
            penultimateTextRun,
            lastTextRun,
        };
    }

    private static getParagraphParentTableCell(
        obj:
            | docs_v1.Schema$StructuralElement[]
            | docs_v1.Schema$StructuralElement
            | any,
        endIndex: number,
    ) {
        //console.group('-------------isParagraphInTableCell------------')
        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (this.getParagraphParentTableCell(item, endIndex)) return;
            }
        } else if (obj.tableCells) {
            for (const cell of obj.tableCells) {
                //console.log(`Cell indexes: ${cell.startIndex}-${cell.endIndex} :: TextRunEndIndex: ${endIndex}`);
                if (cell.endIndex === endIndex) {
                    //console.log('MATCH!!!')
                    const lastElements =
                        this.getlastTwoTextRunsFromTableCell(cell);
                    return {
                        penultimateParagraph: lastElements.penultimateParagraph,
                        lastParagraph: lastElements.lastParagraph,
                        penultimateTextRun: lastElements.penultimateTextRun,
                        lastTextRun: lastElements.lastTextRun,
                        parentCell: cell as docs_v1.Schema$TableCell,
                    };
                }
            }
        } else if (typeof obj === 'object') {
            const keyRegex = /style$|^content$|^textrun$/i;
            for (const key in obj) {
                if (keyRegex.test(key) || typeof obj[key] !== 'object')
                    continue;
                if (this.getParagraphParentTableCell(obj[key], endIndex))
                    return;
            }
        }
        //console.groupEnd();
        return;
    }
    private static templateTagToRangeName(tag: string): string {
        return tag
            .replace(/#ENVI#/, '')
            .replace(/#/, '')
            .trim();
    }

    static getNamedRangeByName(
        document: docs_v1.Schema$Document,
        name: string,
    ) {
        if (!document.namedRanges || !document.namedRanges[name])
            return undefined;

        const namedRanges = document.namedRanges[name].namedRanges;
        if (!namedRanges) {
            return undefined;
        }

        return namedRanges.find((item) => {
            const rangeName = item.name?.toLocaleUpperCase();
            return rangeName === name.toLocaleUpperCase();
        });
    }

    /**
     * zwraca tablicę wszystkich paragrafów niezależnie jak głęboko są osadzone w dokumentcie
     * @param obj :docs_v1.Schema$StructuralElement[] - document.body.content;
     * @use getAllParagraphElementsFromDocument(document.body.content)
     */
    static getAllParagraphElementsFromDocument(
        obj:
            | docs_v1.Schema$StructuralElement[]
            | docs_v1.Schema$StructuralElement
            | any,
    ): docs_v1.Schema$StructuralElement[] {
        let paragraphElements: docs_v1.Schema$StructuralElement[] = [];

        if (Array.isArray(obj)) {
            for (const item of obj)
                paragraphElements = paragraphElements.concat(
                    this.getAllParagraphElementsFromDocument(item),
                );
        } else if (typeof obj === 'object' && obj !== null) {
            if (obj.paragraph) {
                paragraphElements.push(obj);
            } else {
                for (const key in obj)
                    paragraphElements = paragraphElements.concat(
                        this.getAllParagraphElementsFromDocument(obj[key]),
                    );
            }
        }
        return paragraphElements;
    }

    static paragraphContainsText(
        paragraph: docs_v1.Schema$Paragraph,
        textRunContentRegexp: RegExp | string,
    ) {
        if (paragraph.elements)
            for (const element of paragraph.elements)
                if (element.textRun?.content) {
                    textRunContentRegexp = new RegExp(textRunContentRegexp);
                    return textRunContentRegexp.test(element.textRun.content);
                }
        return false;
    }

    /**
     * Funkcja działa dla przypadków, gdy zakres nazwany obejmuje cały lub część pojedynczego ParagraphElement
     * zwraca tablicę TextrunElements objętych w całości lub w częsci zaresem indeksów i nadrzędny paragraf dla podanych indexów
     */
    private static getTextRunsAndParagraphElement(
        paragraphElements: docs_v1.Schema$StructuralElement[],
        startIndex: number,
        endIndex: number,
    ) {
        const affectedParagraphs: docs_v1.Schema$StructuralElement[] = [];
        let affectedTextRunElements: docs_v1.Schema$ParagraphElement[] = [];
        for (const element of paragraphElements) {
            if (
                !element.paragraph?.elements ||
                element.paragraph?.elements?.length === 0
            ) {
                throw new Error(
                    'Function getTextRunElementByIndexes cannot be used for empty Pragraphs',
                );
            }
            if (!element.startIndex || !element.endIndex) continue;
            //              RS||||||||||||||||||||||RE
            //           ES|||||||EE ES|||||||EE ES|||||||EE
            //paragraf zaczyna się przed końcem NamedRange i kończy się po początku namedRange
            if (
                element.startIndex < endIndex &&
                element.endIndex > startIndex &&
                endIndex > startIndex
            ) {
                affectedParagraphs.push(element);
                //czy paragraph jst mniejszy niz zakres

                const foundElements = element.paragraph.elements.filter(
                    (element) => {
                        if (
                            !element.startIndex ||
                            !element.endIndex ||
                            !element.textRun
                        )
                            return false;
                        return (
                            element.endIndex > startIndex ||
                            element.startIndex < endIndex
                        );
                    },
                );

                affectedTextRunElements.push(...foundElements);
            }
            const lastTextrunElement =
                affectedTextRunElements[affectedTextRunElements.length - 1];
            if (
                lastTextrunElement &&
                lastTextrunElement.endIndex &&
                lastTextrunElement.endIndex >= endIndex
            )
                return {
                    textRunElements: affectedTextRunElements,
                    parentElements: affectedParagraphs,
                };
        }
    }

    private static getTextRunByStartIndex(
        paragraph: docs_v1.Schema$Paragraph,
        startIndex: number,
    ) {
        if (!paragraph || !paragraph.elements) return;
        for (const element of paragraph.elements)
            if (element.startIndex === startIndex && element.textRun)
                return element;
    }

    private static sortNamedRangesDescending(
        namedRanges: docs_v1.Schema$NamedRanges,
    ): docs_v1.Schema$NamedRanges[] {
        return Object.values(namedRanges).sort((a, b) => {
            return (
                b.namedRanges[0].ranges[0].startIndex -
                a.namedRanges[0].ranges[0].startIndex
            );
        });
    }

    static async batchUpdateDocument(
        auth: OAuth2Client,
        batchUpdateRequests: docs_v1.Schema$Request[],
        documentId: string,
    ) {
        const docs = google.docs({ version: 'v1', auth });
        return await docs.documents.batchUpdate({
            auth: auth,
            requestBody: { requests: batchUpdateRequests },
            documentId: documentId,
        });
    }
}
