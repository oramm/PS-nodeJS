import BusinessObject from '../../BussinesObject';
import { CityData } from '../../types/types';

export default class City extends BusinessObject implements CityData {
    id?: number;
    name: string;
    code?: string;

    constructor(initParamObject: CityData) {
        super({ ...initParamObject, _dbTableName: 'Cities' });
        this.name = initParamObject.name;
        this.code = initParamObject.code;
    }
}
