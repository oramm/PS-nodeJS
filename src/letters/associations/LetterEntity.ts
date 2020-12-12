

export default class LetterEntity {
    letterId: number;
    _letter: any;
    entityId: number;
    _entity: any;
    letterRole: 'CC' | 'MAIN';
    id: string;


    constructor(initParamObject: any) {
        this.letterId = initParamObject._letter.id;
        this._letter = initParamObject._letter;

        this.entityId = initParamObject._entity.id;
        this._entity = initParamObject._entity;

        this.letterRole = initParamObject.letterRole;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.letterId + this.entityId;
    }
}
