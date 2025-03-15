import {
    ContractRoleData,
    OtherContractData,
    OurContractData,
} from '../../types/types';
import Role from './Role';

export default class ContractRole extends Role implements ContractRoleData {
    contractId?: number | null;
    _contract?: OurContractData | OtherContractData;

    constructor(initParamObject: ContractRoleData) {
        super({ ...initParamObject });
        this.contractId = initParamObject.contractId ?? null;
        this._contract = initParamObject._contract;
    }
}
