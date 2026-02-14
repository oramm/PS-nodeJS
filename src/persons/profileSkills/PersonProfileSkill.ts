import BusinessObject from '../../BussinesObject';
import {
    PersonProfileSkillV2Record,
    SkillDictionaryRecord,
} from '../../types/types';

export default class PersonProfileSkill
    extends BusinessObject
    implements PersonProfileSkillV2Record
{
    id: number;
    personProfileId: number;
    skillId: number;
    levelCode?: string;
    yearsOfExperience?: number;
    sortOrder?: number;
    _skill?: SkillDictionaryRecord;

    constructor(initParamObject: PersonProfileSkillV2Record) {
        super({
            ...initParamObject,
            _dbTableName: 'PersonProfileSkills',
        });
        this.id = initParamObject.id;
        this.personProfileId = initParamObject.personProfileId;
        this.skillId = initParamObject.skillId;
        this.levelCode = initParamObject.levelCode;
        this.yearsOfExperience = initParamObject.yearsOfExperience;
        this.sortOrder = initParamObject.sortOrder;
        this._skill = initParamObject._skill;
    }
}
