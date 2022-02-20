import { auth, OAuth2Client } from 'google-auth-library';
import { docs_v1, google } from 'googleapis';
import { Envi } from './EnviTypes';
import Tools from './Tools';
import ToolsDate from './ToolsDate';
import ToolsGd from './ToolsGd';

export default class ToolsDocs {
    static async getDocument(auth: OAuth2Client, documentId: string) {
        const docs = google.docs({ version: 'v1', auth });
        const res = await docs.documents.get({
            documentId: documentId
        });
        return res;
    }

    static createNamedRangesByTags(auth: OAuth2Client, document: docs_v1.Schema$Document, tags: string[]) {
        this.clearNamedRanges(auth, document);

        for (const tag of tags) {
            //let element = document.getBody().findText(tag);
            //let range = document.newRange().addElement(element.getElement()).build();
            //document.addNamedRange(this.templateTagToRangeName(tag), range);
        }
    }

    static fillNamedRange(document: docs_v1.Schema$Document, rangeName: string, text: string, style?: {}) {
        if (ToolsDate.isStringAYMDDate(text))
            text = <string>ToolsDate.dateYMDtoDMY(text)
        const namedRange = this.getNamedRangeByName(document, rangeName);
        if (namedRange?.ranges)
            namedRange?.ranges[0].startIndex
        //TODO
    }

    static clearNamedRanges(auth: OAuth2Client, document: docs_v1.Schema$Document) {
        const requests: docs_v1.Schema$Request[] = []
        if (document.namedRanges) {

        }
    }

    private static templateTagToRangeName(tag: string): string {
        return (tag.indexOf('#ENVI#') === 0) ? tag.substring(6, tag.length - 1) : tag;
    }

    static getNamedRangeByName(document: docs_v1.Schema$Document, name: string) {
        if (document.namedRanges) {
            const namedRanges = document.namedRanges[name].namedRanges;
            if (namedRanges)
                return namedRanges.filter(item => {
                    var rangeName = item.name?.toLocaleUpperCase();
                    return rangeName === name.toLocaleUpperCase();
                })[0]
        }
    }

    static getNameRangesTagsFromTemplate(templateFile: docs_v1.Schema$Document): string[] {
        const tags: string[] = [];
        let foundElements = this.getElementsByRegexp(/#ENVI#[aA-zZ|\s]+#/, templateFile);
        for (const element of foundElements) {
            tags.push(<string>element.textRun?.content);
        }
        return tags;
    }

    static getParagraphsByRegexp(regexp: RegExp, file: docs_v1.Schema$Document) {
        const matchedParagraphs = [];
        if (file.body?.content)
            for (const element of file.body?.content) {
                if (element.paragraph)
                    if (this.paragraphMatchRegexp(element.paragraph, <RegExp>regexp))
                        matchedParagraphs.push(element.paragraph);
            }
        return matchedParagraphs;
    }

    static getElementsByRegexp(regexp: RegExp, file: docs_v1.Schema$Document) {
        const matchedParagraphsElements = [];
        if (file.body?.content)
            for (const element of file.body?.content) {
                if (element.paragraph) {
                    let mathedElement = this.paragraphMatchRegexp(element.paragraph, <RegExp>regexp);
                    if (mathedElement)
                        matchedParagraphsElements.push(mathedElement);
                }
            }
        return matchedParagraphsElements;
    }

    private static paragraphMatchRegexp(paragraph: docs_v1.Schema$Paragraph, regexp: RegExp) {
        if (paragraph.elements)
            for (const element of <docs_v1.Schema$ParagraphElement[]>paragraph.elements)
                return (element.textRun?.content?.match(regexp)) ? element : false;
        return false;
    }

    static async batchUpdateDocument(auth: OAuth2Client, batchUpdateRequests: docs_v1.Schema$Request[], documentId: string) {
        const docs = google.docs({ version: 'v1', auth });

        return await docs.documents.batchUpdate({
            requestBody: { requests: batchUpdateRequests },
            documentId: documentId,
            auth: auth
        });
    }
}