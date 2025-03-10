import BusinessObject from '../../BussinesObject';
import {
    OtherContractData,
    OurContractData,
    PersonData,
    ProjectData,
    RoleData,
} from '../../types/types';

export default class Role extends BusinessObject implements RoleData {
    id: number;
    projectId?: number | null;
    _project?: ProjectData;
    contractId?: number | null;
    _contract?: OurContractData | OtherContractData;
    name: string;
    description: string;
    groupName: string;
    personId: number | null;
    _person?: PersonData;

    constructor(initParamObject: RoleData) {
        super({ ...initParamObject, _dbTableName: 'Roles' });
        this.id = initParamObject.id;
        this.projectId = initParamObject.projectId ?? null;
        this._project = initParamObject._project;
        this.contractId = initParamObject.contractId ?? null;
        this._contract = initParamObject._contract;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.groupName = initParamObject.groupName;
        this.personId = initParamObject.personId ?? null;
        this._person = initParamObject._person;
    }
}
