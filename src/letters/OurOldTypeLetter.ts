
import { OAuth2Client } from 'google-auth-library';
import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import { Envi } from '../tools/EnviTypes';
import IncomingLetter from './IncomingLetter';
import Letter from './Letter';

export default class OurOldTypeLetter extends IncomingLetter {
    isOur: boolean = true;
    constructor(initParamObject: any) {
        super(initParamObject);
    }

    makeFolderName(): string {
        return this.number + ' ' + this.creationDate + ' : Wychodzące'
    }
}
