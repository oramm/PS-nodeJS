import BusinessObject from '../../BussinesObject';

export default class City extends BusinessObject {
    id?: number;
    name: string;
    code: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Cities' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.code = initParamObject.code;
    }
}

