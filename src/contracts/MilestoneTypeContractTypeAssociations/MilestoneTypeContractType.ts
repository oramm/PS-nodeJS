import BusinessObject from '../../BussinesObject';
import ToolsDb from '../../tools/ToolsDb';
import ContractType from '../contractTypes/ContractType';
import MilestoneType from '../milestones/milestoneTypes/MilestoneType';

export default class MilestoneTypeContractType extends BusinessObject {
    milestoneTypeId: number;
    contractTypeId: number;
    folderNumber: string;
    isDefault: boolean;
    id: string;
    _milestoneType: MilestoneType;
    _contractType: ContractType;
    _folderNumber_MilestoneTypeName?: any;

    constructor(initParamObject: any) {
        super({
            ...initParamObject,
            _dbTableName: 'MilestoneTypes_ContractTypes',
        });
        this.milestoneTypeId = initParamObject._milestoneType.id;
        this.contractTypeId = initParamObject._contractType.id;
        this.folderNumber = '' + initParamObject.folderNumber;
        this.isDefault = initParamObject.isDefault;
        //id jest usuwane w addInDb(), więc przy asocjacjach musi byś ręcznie odtworeone w controllerze
        this.id = '' + this.milestoneTypeId + this.contractTypeId;
        this._milestoneType = initParamObject._milestoneType;
        this._contractType = initParamObject._contractType;
        this._folderNumber_MilestoneTypeName =
            initParamObject._folderNumber_MilestoneTypeName;
    }

    async addInDb(externalConn?: any, isPartOfTransaction?: boolean) {
        return await ToolsDb.addInDb(
            this._dbTableName,
            this,
            externalConn,
            isPartOfTransaction
        );
    }

    async editInDb(externalConn?: any) {
        const sql = `UPDATE ${this._dbTableName} \n
            SET FolderNumber=?, \n
            IsDefault=?\n
            WHERE MilestoneTypeId=? AND ContractTypeId=?`;
        const params = [
            this.folderNumber,
            this.isDefault,
            this.contractTypeId,
            this.milestoneTypeId,
        ];
        return await ToolsDb.executePreparedStmt(
            sql,
            params,
            this,
            externalConn
        );
    }

    async deleteFromDb() {
        const sql = `DELETE FROM ${this._dbTableName} WHERE MilestoneTypeId=? AND ContractTypeId=?`;
        return await ToolsDb.executePreparedStmt(
            sql,
            [this.milestoneTypeId, this.contractTypeId],
            this
        );
    }
}
