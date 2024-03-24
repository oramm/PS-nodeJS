import BusinessObject from '../BussinesObject';
import { FinancialAidProgrammeData, FocusAreaData } from '../types/types';

export default class FocusArea extends BusinessObject {
    programmeId?: number;
    _programme?: FinancialAidProgrammeData;
    name: string;
    description: string;

    constructor(initParamObject: FocusAreaData) {
        super({ ...initParamObject, _dbTableName: 'FocusAreas' });
        this.programmeId = initParamObject.programmeId;
        this._programme = initParamObject._programme;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
    }
}
