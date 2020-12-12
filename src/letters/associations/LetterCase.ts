

export default class LetterCase {
    letterId: number;
    caseId: number;
    id: string;
    _letter: any;
    _case: any;

    constructor(initParamObject: any) {
        this.letterId = initParamObject._letter.id;
        this.caseId = initParamObject._case.id;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.letterId + this.caseId;
        this._letter = initParamObject._letter;
        this._case = initParamObject._case;
    }
}
