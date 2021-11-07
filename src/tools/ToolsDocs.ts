import { OAuth2Client } from 'google-auth-library';
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

    static async copyDoc(auth: OAuth2Client, sourceGdocumentId: string, copyName: string) {
        return await ToolsGd.copyFile(auth, sourceGdocumentId, copyName)
    }

    /** Replaces the text in existing named ranges. */
    static async fillNamedRange(auth: OAuth2Client, documentId: string, rangeName: string, text: string, style?: {}) {
        if (ToolsDate.isStringAYMDDate(text))
            text = <string>ToolsDate.dateYMDtoDMY(text)
        const document = await this.getDocument(auth, documentId);
        const namedRange = await this.getNamedRangeByName(document, rangeName);
        var element = namedRange.getRange().getRangeElements()[0];
        element.getElement().asText().setText(ToolsHtml.parseHtmlToText(text));
        if (style) {
            element.getElement().asText().setAttributes(style);
        }
        namedRange.remove();
        var range = document.newRange().addElement(element.getElement()).build();

        console.log('fillNamedRange: ' + namedRange.getName());
        document.addNamedRange(rangeName, range);
        //this.logNamedRanges(document);
    }

    static clearNamedRanges(documentGdId: string) {
        var document = DocumentApp.openById(documentGdId);
        for (var range of document.getNamedRanges())
            range.remove();

        console.log('wyczyszczono zakresy w pliku')
    }

    static logNamedRanges(document: GoogleAppsScript.Document.Document) {
        var ranges: GoogleAppsScript.Document.NamedRange[] = document.getNamedRanges();
        for (var i = 0; i < ranges.length; i++)
            console.log(ranges[i].getName() + ' ' + ranges[i].getId());
    }



    //https://stackoverflow.com/questions/30654389/how-to-add-named-ranges-to-sub-paragraph-elements-in-google-apps-script
    static createNamedRangesByTags(documentGdId: string, tags: string[]) {
        var document = DocumentApp.openById(documentGdId);
        this.clearNamedRanges(documentGdId);

        for (var i = 0; i < tags.length; i++) {
            let element = document.getBody().findText(tags[i]);
            let range = document.newRange().addElement(element.getElement()).build();
            document.addNamedRange(this.templateTagToTangeName(tags[i]), range);
            this.logNamedRanges(document);
        }
        return document.getNamedRanges();
    }

    private static templateTagToTangeName(tag: string): string {
        return (tag.indexOf('#ENVI#') === 0) ? tag.substring(6, tag.length - 1) : tag;
    }

    static getNamedRangeByName(document: docs_v1.Schema$Document, name: string) {
        const namedRanges = document.;
        if (namedRanges)
            namedRanges
        return namedRanges.filter(item => {
            var rangeName = item.getName().toLocaleUpperCase();
            console.log(rangeName + ' === ' + name.toLocaleUpperCase());
            return rangeName === name.toLocaleUpperCase();
        })[0]
    }

    static getNameRangesTagsFromTemplate(templateGdId: string): string[] {
        var tags: string[] = [];
        var document = DocumentApp.openById(templateGdId);
        var body = document.getBody();
        var foundElement = body.findText('#ENVI#[aA-zZ|\s]+#');
        while (foundElement != null) {
            var tag: string = foundElement.getElement().asText().getText();
            tags.push(tag);
            foundElement = body.findText('#ENVI#[aA-zZ|\s]+#', foundElement);
        }
        console.log(tags);
        return tags;
    }

    static highlightText(documentGdId: string, text: string): void {
        var body = DocumentApp.getActiveDocument().getBody();
        var foundElement = body.findText(text);

        while (foundElement != null) {
            // Get the text object from the element
            var foundText = foundElement.getElement().asText();

            // Where in the Element is the found text?
            var start = foundElement.getStartOffset();
            var end = foundElement.getEndOffsetInclusive();

            // Change the background color to yellow
            foundText.setBackgroundColor(start, end, "#FCFC00");

            // Find the next match
            foundElement = body.findText(text, foundElement);
        }
    }
}
}