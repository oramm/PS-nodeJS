import IncomingLetter from './IncomingLetter';
import IncomingLetterContractGdController from './gdControlers/IncomingLetterContractGdController';

/**@deprecated */
export default class OurOldTypeLetter extends IncomingLetter {
    isOur: any = true;
    _letterGdController = new IncomingLetterContractGdController();

    constructor(initParamObject: any) {
        super(initParamObject);
    }
    /**do usunięcia - trzeba dodać gdController */
    makeFolderName(): string {
        return this.number + ' ' + this.creationDate + ' : Wychodzące';
    }

    makeParentFolderGdId(): string {
        return '';
    }
}
