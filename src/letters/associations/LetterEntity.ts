import BusinessObject from "../../BussinesObject";
import Entity from "../../entities/Entity";
import Letter from "../Letter";


export default class LetterEntity extends BusinessObject {
    letterId: number;
    _letter: Letter;
    entityId: number;
    _entity: Entity;
    letterRole: 'CC' | 'MAIN';
    id: string;


    constructor(initParamObject: { _letter: any, _entity: Entity, letterRole: 'CC' | 'MAIN' }) {
        super({ _dbTableName: 'Letters_Entities' });
        this.letterId = initParamObject._letter.id;
        this._letter = initParamObject._letter;

        this.entityId = <number>initParamObject._entity.id;
        this._entity = initParamObject._entity;

        this.letterRole = initParamObject.letterRole;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.letterId + this.entityId;
    }
}
