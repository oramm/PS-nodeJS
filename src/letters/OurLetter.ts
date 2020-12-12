
import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import Letter from './Letter';

export default class OurLetter extends Letter {
    _template: DocumentTemplate | undefined;

    constructor(initParamObject: any) {
        super(initParamObject);
        this.isOur = true;
        this.number = initParamObject.number;
        //_template jest potrzebny tylko przy tworzeniu pisma
        if (initParamObject._template)
            this._template = initParamObject._template;
    }
}
