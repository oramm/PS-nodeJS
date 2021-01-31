import BusinessObject from '../BussinesObject';
import ToolsDb from '../tools/ToolsDb';

export default class Person extends BusinessObject {
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
        super({ _dbTableName: 'Persons' });
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

    async getSystemRole() {
        const personIdCondition = (this.id) ? 'Persons.Id=' + this.id : '1';
        const systemEmailCondition = (this.systemEmail) ? 'Persons.SystemEmail = "' + this.systemEmail + '"' : '1';

        const sql = 'SELECT \n \t' +
            'Persons.SystemRoleId, \n \t ' +
            'Persons.Id AS PersonId, \n \t ' +
            'SystemRoles.Name AS SystemRoleName \n' +
            'FROM Persons \n ' +
            'JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id \n' +
            'WHERE ' + systemEmailCondition + ' AND ' + personIdCondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        try {
            var row = result[0];
            return {
                personId: row.PersonId,
                systemRoleId: row.SystemRoleId,
                name: row.SystemRoleName
            };
        } catch (err) {
            throw err;
        }
    }
}

