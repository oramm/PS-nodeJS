import BusinessObject from '../../BussinesObject';
import { PersonProfileEducationV2Record } from '../../types/types';

export default class PersonProfileEducation
    extends BusinessObject
    implements PersonProfileEducationV2Record
{
    id: number;
    personProfileId: number;
    schoolName?: string;
    degreeName?: string;
    fieldOfStudy?: string;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: number;

    constructor(initParamObject: PersonProfileEducationV2Record) {
        super({
            ...initParamObject,
            _dbTableName: 'PersonProfileEducations',
        });
        this.id = initParamObject.id;
        this.personProfileId = initParamObject.personProfileId;
        this.schoolName = initParamObject.schoolName;
        this.degreeName = initParamObject.degreeName;
        this.fieldOfStudy = initParamObject.fieldOfStudy;
        this.dateFrom = initParamObject.dateFrom;
        this.dateTo = initParamObject.dateTo;
        this.sortOrder = initParamObject.sortOrder;
    }
}
