import BusinessObject from '../../BussinesObject';

export default class ContractType extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    isOur: boolean;
    status: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'ContractTypes' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.isOur = initParamObject.isOur;
        this.status = initParamObject.status;
    }
}

