import IncomingLetter from './IncomingLetter';
import IncomingLetterContractGdController from './gdControlers/IncomingLetterContractGdController';

/**@deprecated */
export default class OurOldTypeLetter extends IncomingLetter {
    isOur: any = true;
    _letterGdController = new IncomingLetterContractGdController();
    _project: any;

    constructor(initParamObject: any) {
        super(initParamObject);
        this._project = initParamObject._project;
    }
    /**do usunięcia - trzeba dodać gdController */
    makeFolderName(): string {
        return this.number + ' ' + this.creationDate + ' : Wychodzące';
    }

    makeParentFolderGdId(): string {
        return '';
    }
}
