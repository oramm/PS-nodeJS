import BusinessObject from '../BussinesObject';
import { FinancialAidProgrammeData } from '../types/types';

export default class FinancialAidProgramme extends BusinessObject {
    name: string;
    description: string;
    url: string;

    constructor(initParamObject: FinancialAidProgrammeData) {
        super({ ...initParamObject, _dbTableName: 'FinancialAidProgrammes' });
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.url = initParamObject.url;
    }
}
