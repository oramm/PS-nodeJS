import BusinessObject from '../../BussinesObject';
import { ContractRangeData } from '../../types/types';

export default class ContractRange
    extends BusinessObject
    implements ContractRangeData
{
    id: number;
    name: string;
    description: string;

    constructor(initParamObject: ContractRangeData) {
        super({ ...initParamObject, _dbTableName: 'ContractRanges' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
    }
}
