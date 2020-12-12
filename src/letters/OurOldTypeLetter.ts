
import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import Letter from './Letter';

export default class OurOldTypeLetter extends Letter {
    constructor(initParamObject: any) {
        super(initParamObject);
        this.isOur = true;
    }
}
