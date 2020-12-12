
import Letter from './Letter';

export default class IncomingLetter extends Letter {
    constructor(initParamObject: any) {
        super(initParamObject);
        this.isOur = false;
        this.number = initParamObject.number;

    }
}

