import { Console, group, time } from 'console';
import { auth, OAuth2Client } from 'google-auth-library';
import { docs_v1, google } from 'googleapis';
import ToolsDocs from '../tools/ToolsDocs';

export const documentId = '1gFSy15NLPOBJj3A8J31H3NMnY6kztGmZnzm95Cfv1-0';

/**używać do zresetowania szablonu testowego - zakłąda, ze namedRanges już istenieją */
export default class TestDocTools {
    static async resetTags(auth: OAuth2Client) {
        let document = (await ToolsDocs.getDocument(auth, documentId)).data;
        const namedRangesNames = Object.getOwnPropertyNames(
            document.namedRanges || {}
        );

        if (!namedRangesNames.length)
            return {
                info: 'Document was already reset - no namedRanges found',
                content: document.body?.content,
            };
        const newData = namedRangesNames.map((name) => {
            return {
                rangeName: name,
                newText: `#ENVI#${name}#`,
            };
        });

        //await ToolsDocs.updateTextRunsInNamedRanges(auth, documentId, newData);
        await ToolsDocs.clearNamedRanges(auth, documentId);
        //sprawdź status
        document = (await ToolsDocs.getDocument(auth, documentId)).data;
        return {
            content: document.body?.content,
            namedRanges: document.namedRanges,
        };
    }

    static async init(auth: OAuth2Client) {
        let namedRanges;
        await ToolsDocs.initNamedRangesFromTags(auth, documentId);
        let document = (await ToolsDocs.getDocument(auth, documentId)).data;

        const namedRangesNames = Object.getOwnPropertyNames(
            document.namedRanges
        );
        const newData =
            TestDocTools.makeTestDataFromNamedRanges(namedRangesNames);

        await ToolsDocs.updateTextRunsInNamedRanges(auth, documentId, newData);
        document = (await ToolsDocs.getDocument(auth, documentId)).data;
        namedRanges = document.namedRanges;

        return { content: document.body?.content, namedRanges };
    }

    private static makeTestDataFromNamedRanges(namedRangesNames: string[]) {
        return namedRangesNames.map((nameTag) => {
            let i = 1;
            return { rangeName: nameTag, newText: makeRangeContent(nameTag) };
        });
    }

    static async update(auth: OAuth2Client) {
        let namedRanges;
        console.log(`----ToolsDocs.refreshNamedRangesFromTags`);
        console.group();
        await ToolsDocs.refreshNamedRangesFromTags(auth, documentId);
        console.groupEnd();
        let document = (await ToolsDocs.getDocument(auth, documentId)).data;
        const namedRangesNames = Object.getOwnPropertyNames(
            document.namedRanges || {}
        );
        if (namedRangesNames.length)
            console.log('NamedRangesNamesFound %o', namedRangesNames);
        else throw new Error('No namedRanges found');

        document = (await ToolsDocs.getDocument(auth, documentId)).data;
        namedRanges = document.namedRanges;

        const newData =
            TestDocTools.makeTestDataFromNamedRanges(namedRangesNames);
        console.group();
        await ToolsDocs.updateTextRunsInNamedRanges(auth, documentId, newData);
        console.groupEnd();
        const documentContent = (await ToolsDocs.getDocument(auth, documentId))
            .data.body?.content;
        return { documentContent, namedRanges };
    }
}

function makeRangeContent(nameTag: string): string {
    const currentTime = new Date();
    return `Test- ${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()} "${nameTag}"`;
}
