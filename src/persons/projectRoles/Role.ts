import BusinessObject from '../../BussinesObject';
import { PersonData, RoleData } from '../../types/types';

export default class Role extends BusinessObject implements RoleData {
    id: number;
    name: string;
    description: string;
    groupName: string;
    personId: number | null;
    _person?: PersonData;

    constructor(initParamObject: RoleData) {
        super({ ...initParamObject, _dbTableName: 'Roles' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.groupName = initParamObject.groupName;
        this._person = initParamObject._person;
        this.personId =
            initParamObject._person?.id ?? initParamObject.personId ?? null;
    }
}
