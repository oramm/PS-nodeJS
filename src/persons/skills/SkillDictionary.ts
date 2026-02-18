import BusinessObject from '../../BussinesObject';
import { SkillDictionaryRecord } from '../../types/types';

export default class SkillDictionary
    extends BusinessObject
    implements SkillDictionaryRecord
{
    id: number;
    name: string;
    nameNormalized: string;
    description?: string | null;

    constructor(initParamObject: SkillDictionaryRecord) {
        super({
            ...initParamObject,
            _dbTableName: 'SkillsDictionary',
        });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.nameNormalized = initParamObject.nameNormalized;
        this.description = initParamObject.description ?? null;
    }
}
