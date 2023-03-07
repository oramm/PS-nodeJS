
import IncomingLetter from './IncomingLetter';

/**@deprecated */
export default class OurOldTypeLetter extends IncomingLetter {
    isOur: boolean = true;
    constructor(initParamObject: any) {
        super(initParamObject);
    }
    /**do usunięcia - trzeba dodać gdController */
    makeFolderName(): string {
        return this.number + ' ' + this.creationDate + ' : Wychodzące'
    }
}
