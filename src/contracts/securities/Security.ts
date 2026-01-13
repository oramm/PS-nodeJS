import BusinessObject from '../../BussinesObject';
import Person from '../../persons/Person';
import Tools from '../../tools/Tools';
import ToolsDate from '../../tools/ToolsDate';
import ToolsGd from '../../tools/ToolsGd';
import ContractOur from '../ContractOur';
import Case from '../milestones/cases/Case';

import Project from '../../projects/Project';
import ContractType from '../contractTypes/ContractType';

export type SecuritiesSearchParams = {
    id?: number;
    projectId?: string;
    _parent?: Project;
    searchText?: string;
    contractOurId?: string;
    startDateFrom?: string;
    startDateTo?: string;
    firstPartExpiryDateFrom?: string;
    firstPartExpiryDateTo?: string;
    secondPartExpiryDateFrom?: string;
    secondPartExpiryDateTo?: string;
    status?: string;
    contractName?: string;
    contractAlias?: string;
    typeId?: number;
    _contractType?: ContractType;
};

export class Security extends BusinessObject {
    id?: number;
    contractId: number;
    description: string;
    value: number | string;
    firstPartRate: number;
    secondPartRate: number;
    firstPartExpiryDate?: string;
    secondPartExpiryDate?: string;
    returnedValue: number = 0;
    deductionValue: number = 0;
    isCash: boolean;
    _case?: Case;
    caseId?: number;
    _remainingValue: number;
    _contract: ContractOur;
    _editor: Person;
    _lastUpdated: Date;
    _gdFolderUrl?: string;
    status: string;

    constructor(initParamObject: SecurityInitParms) {
        super({ ...initParamObject, _dbTableName: 'Securities' });
        const {
            id,
            description,
            value,
            returnedValue,
            deductionValue,
            _case,
            _contract,
            firstPartRate,
            secondPartRate,
            firstPartExpiryDate,
            secondPartExpiryDate,
            isCash,
            _editor,
            _lastUpdated,
            status,
        } = initParamObject;
        if (!_contract.id) throw new Error(`Nie podano id kontraktu`);

        this.id = id;
        this.contractId = _contract.id;
        this.description = description;
        this.firstPartRate = firstPartRate;
        this.secondPartRate = secondPartRate;
        this.value =
            typeof value === 'string' ? Tools.stringToNumber(value) : value;
        this.status = status;
        this.returnedValue =
            typeof returnedValue === 'string'
                ? Tools.stringToNumber(returnedValue)
                : returnedValue;
        this.deductionValue =
            typeof deductionValue === 'string'
                ? Tools.stringToNumber(deductionValue)
                : deductionValue;
        this._remainingValue = this.value - returnedValue;
        this.firstPartExpiryDate = ToolsDate.dateJsToSql(firstPartExpiryDate);
        this.secondPartExpiryDate = ToolsDate.dateJsToSql(secondPartExpiryDate);
        this.isCash = isCash;
        this._case = _case instanceof Case || !_case ? _case : new Case(_case);
        this._contract = _contract;
        this._editor = _editor;
        this._lastUpdated = _lastUpdated;
        if (this._case?.gdFolderId)
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                this._case.gdFolderId
            );
    }

    /**Ustawia wartość atrybutu */
    setGdFolderUrl() {
        if (this._case?.gdFolderId)
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                this._case?.gdFolderId
            );
    }
}

export type SecurityInitParms = {
    id?: number;
    description: string;
    value: number | string;
    returnedValue: number;
    deductionValue: number;
    firstPartRate: number;
    secondPartRate: number;
    firstPartExpiryDate: Date | string;
    secondPartExpiryDate: Date | string;
    isCash: boolean;
    _case?: Case;
    _contract: ContractOur;
    _lastUpdated: Date;
    _editor: Person;
    status: string;
};
