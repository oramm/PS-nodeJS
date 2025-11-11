import BusinessObject from '../../BussinesObject';
import ContractOur from '../ContractOur';
import { OAuth2Client } from 'google-auth-library';
import CasesController from '../milestones/cases/CasesController';
import Setup from '../../setup/Setup';
import ToolsGd from '../../tools/ToolsGd';
import Person from '../../persons/Person';
import ToolsDate from '../../tools/ToolsDate';
import Case from '../milestones/cases/Case';
import MilestonesController from '../milestones/MilestonesController';
import CaseTypesController from '../milestones/cases/caseTypes/CaseTypesController';
import Tools from '../../tools/Tools';
import ToolsDb from '../../tools/ToolsDb';
import { CaseData } from '../../types/types';

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

    async addNewController(auth: OAuth2Client) {
        const caseItem = await this.createCase(auth);
        this.caseId = caseItem.id;
        await this.addInDb();

        this.setGdFolderUrl();
    }

    async editController(auth: OAuth2Client) {
        await this.editInDb();
    }

    async getCase(): Promise<Case | undefined> {
        return (
            await CasesController.getCasesList([
                {
                    contractId: this.contractId,
                    typeId: Setup.CaseTypes.SECURITY_GUARANTEE,
                },
            ])
        )[0];
    }

    async getMilestone() {
        const milestone = (
            await MilestonesController.getMilestonesList([
                {
                    contractId: this.contractId,
                    typeId: Setup.MilestoneTypes.OURCONTRACT_ADMINISTRATION,
                },
            ])
        )[0];
        return milestone;
    }

    async getCaseType() {
        const caseType = (
            await CaseTypesController.getCaseTypesList([
                { id: Setup.CaseTypes.SECURITY_GUARANTEE },
            ])
        )[0];
        return caseType;
    }

    async createCase(auth: OAuth2Client) {
        const caseItem = new Case({
            _type: await this.getCaseType(),
            _parent: await this.getMilestone(),
        });
        // ✅ Przekazuje auth - NIE pobiera tokenu ponownie
        const result = await CasesController.add(caseItem, auth);
        return result.caseItem;
    }

    /**Ustawia wartość atrybutu */
    setGdFolderUrl() {
        if (this._case?.gdFolderId)
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                this._case?.gdFolderId
            );
    }

    async deleteController(auth: OAuth2Client) {
        await this.deleteFromDb();

        // ✅ Przekazuje auth - NIE pobiera tokenu ponownie
        if (this._case) await CasesController.delete(this._case, auth);
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
