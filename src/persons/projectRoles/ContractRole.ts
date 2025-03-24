import BusinessObject from '../../BussinesObject';
import {
    OtherContractData,
    OurContractData,
    PersonData,
    ContractRoleData as ContractRoleData,
} from '../../types/types';

export default class ContractRole
    extends BusinessObject
    implements ContractRoleData
{
    id: number;
    name: string;
    description: string;
    contractId?: number | null;
    _contract?: OurContractData | OtherContractData;
    groupName: string;
    personId: number | null;
    _person?: PersonData;

    constructor(initParamObject: ContractRoleData) {
        super({ ...initParamObject, _dbTableName: 'Roles' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.groupName = initParamObject.groupName;
        this.contractId = initParamObject.contractId ?? null;
        this._contract = initParamObject._contract;
        this._person = initParamObject._person;
        this.personId =
            initParamObject._person?.id ?? initParamObject.personId ?? null;
    }
}
