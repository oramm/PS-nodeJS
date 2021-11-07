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

    static async copyDoc(auth: OAuth2Client, sourceGdocumentId: string, copyName: string) {
        return await ToolsGd.copyFile(auth, sourceGdocumentId, copyName)
    }


}