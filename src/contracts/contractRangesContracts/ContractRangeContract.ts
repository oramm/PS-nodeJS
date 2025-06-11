import BusinessObject from '../../BussinesObject';
import {
    ContractRangeData,
    ContractData,
    ContractRangePerContractData,
    OurContractData,
    OtherContractData,
} from '../../types/types';

export default class ContractRangeContract
    extends BusinessObject
    implements ContractRangePerContractData
{
    contractRangeId: number;
    contractId: number;
    _contractRange: ContractRangeData;
    _contract?: OurContractData | OtherContractData;
    associationComment?: string | null;

    constructor(initParamObject: ContractRangePerContractData) {
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
        this.associationComment = initParamObject.associationComment;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworzone w controllerze
        this.id = '' + this.contractRangeId + this.contractId;
    }
}
