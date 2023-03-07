import DocumentTemplate from "../documentTemplates/DocumentTemplate";
import { OAuth2Client } from 'google-auth-library';
import DocumentGdFile from "../documentTemplates/DocumentGdFile";
import { Envi } from "../tools/EnviTypes";
import ToolsDocs from "../tools/ToolsDocs";
import Letter from "./Letter";
import LetterGdController from "./LetterGdController";
import OurLetter from "./OurLetter";
import ToolsGd from "../tools/ToolsGd";
import { drive_v3 } from "googleapis";

export default class OurLetterGdController extends LetterGdController {
    static makeFolderName(number: string, creationDate: string): string {
        let folderName: string = super.makeFolderName(number, creationDate);
        return folderName += ': Wychodzące'
    }
}