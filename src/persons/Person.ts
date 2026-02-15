import BusinessObject from '../BussinesObject';
import { EntityData, PersonData } from '../types/types';

export default class Person extends BusinessObject implements PersonData {
    id?: number;
    entityId?: number;
    name: string;
    surname: string;
    position: string;
    email: string;
    cellphone: string;
    phone: string;
    comment: string;
    systemRoleId?: number;
    systemEmail?: string;
    _alias: string;
    _entity: EntityData;
    _nameSurnameEmail: string;
    _skillNames?: string;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Persons' });

        this.id = initParamObject.id;
        if (initParamObject._entity) this.entityId = initParamObject._entity.id;
        this._entity = initParamObject._entity;
        this.name = initParamObject.name;
        this.surname = initParamObject.surname;
        this.position = initParamObject.position;
        this.email = initParamObject.email;
        this.cellphone = initParamObject.cellphone;
        this.phone = initParamObject.phone;
        this.comment = initParamObject.comment;
        this.systemRoleId = initParamObject.systemRoleId;
        this.systemEmail = initParamObject.systemEmail;
        this._nameSurnameEmail =
            this.name + ' ' + this.surname + ' ' + this.email;
        this._alias = '';
        if (this.name && this.surname)
            this._alias =
                this.name.substring(0, 1) + this.surname.substring(0, 3);
        this._skillNames = initParamObject._skillNames;
    }
}
