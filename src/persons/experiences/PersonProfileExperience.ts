import BusinessObject from '../../BussinesObject';
import { PersonProfileExperienceV2Record } from '../../types/types';

export default class PersonProfileExperience
    extends BusinessObject
    implements PersonProfileExperienceV2Record
{
    id: number;
    personProfileId: number;
    organizationName?: string;
    positionName?: string;
    description?: string;
    dateFrom?: string;
    dateTo?: string;
    isCurrent?: boolean;
    sortOrder?: number;

    constructor(initParamObject: PersonProfileExperienceV2Record) {
        super({
            ...initParamObject,
            _dbTableName: 'PersonProfileExperiences',
        });
        this.id = initParamObject.id;
        this.personProfileId = initParamObject.personProfileId;
        this.organizationName = initParamObject.organizationName;
        this.positionName = initParamObject.positionName;
        this.description = initParamObject.description;
        this.dateFrom = initParamObject.dateFrom;
        this.dateTo = initParamObject.dateTo;
        this.isCurrent = initParamObject.isCurrent;
        this.sortOrder = initParamObject.sortOrder;
    }
}
