export default class Person {
    id?: number;
    entityId: any;
    name: any;
    surname: any;
    position: any;
    email: any;
    cellphone: any;
    phone: any;
    comment: any;
    systemRoleId: any;
    systemEmail: any;
    _entity: any;
    _nameSurnameEmail: any;


    constructor(initParamObject: any) {
        if (initParamObject) {
            this.id = initParamObject.id;
            if (initParamObject._entity) this.entityId = initParamObject._entity.id;
            this.name = initParamObject.name;
            this.surname = initParamObject.surname;
            this.position = initParamObject.position;
            this.email = initParamObject.email;
            this.cellphone = initParamObject.cellphone;
            this.phone = initParamObject.phone;
            this.comment = initParamObject.comment;
            this.systemRoleId = initParamObject.systemRoleId;
            this.systemEmail = initParamObject.systemEmail;
            this._entity = initParamObject._entity;
            this._nameSurnameEmail = this.name + ' ' + this.surname + ' ' + this.email;
        }
    }
}

