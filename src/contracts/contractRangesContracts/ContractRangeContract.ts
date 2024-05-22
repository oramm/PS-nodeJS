import BusinessObject from '../../BussinesObject';
import {
    ContractRangeData,
    ContractData,
    ContractRangeContractData,
    OurContractData,
    OtherContractData,
} from '../../types/types';

export default class ContractRangeContract
    extends BusinessObject
    implements ContractRangeContractData
{
    contractRangeId: number;
    contractId: number;
    _contractRange: ContractRangeData;
    _contract?: OurContractData | OtherContractData;
    comment?: string | null;

    constructor(initParamObject: ContractRangeContractData) {
        super({ ...initParamObject, _dbTableName: 'ContractRangesContracts' });

        if (
            !initParamObject.contractRangeId &&
            !initParamObject._contractRange.id
        )
            throw new Error('ContractRangeId is required');
        if (!initParamObject.contractId && !initParamObject._contract?.id)
            throw new Error('ContractId is required');

        this.contractRangeId = (initParamObject.contractRangeId ??
            initParamObject._contractRange.id) as number;
        this.contractId = (initParamObject.contractId ||
            initParamObject._contract?.id) as number;

        this._contractRange = initParamObject._contractRange;
        this._contract = initParamObject._contract;
        this.comment = initParamObject.comment;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworzone w controllerze
        this.id = '' + this.contractRangeId + this.contractId;
    }
}
