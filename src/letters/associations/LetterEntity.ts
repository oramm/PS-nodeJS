import BusinessObject from '../../BussinesObject';
import { EntityData, LetterData } from '../../types/types';

export default class LetterEntity extends BusinessObject {
    letterId: number;
    _letter: LetterData;
    entityId: number;
    _entity: EntityData;
    letterRole: 'CC' | 'MAIN';
    id: string;

    constructor(initParamObject: {
        _letter: LetterData;
        _entity: EntityData;
        letterRole: 'CC' | 'MAIN';
    }) {
        super({ _dbTableName: 'Letters_Entities' });
        if (!initParamObject._letter.id)
            throw new Error('Letter id is required');

        this.letterId = initParamObject._letter.id;
        this._letter = initParamObject._letter;

        this.entityId = <number>initParamObject._entity.id;
        this._entity = initParamObject._entity;

        this.letterRole = initParamObject.letterRole;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.letterId + this.entityId;
    }
}
