import BusinessObject from '../BussinesObject';
import ToolsDb from '../tools/ToolsDb';

export default class Person extends BusinessObject {
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
    _entity: any;
    _nameSurnameEmail: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Persons' });

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
        this._nameSurnameEmail = this.name + ' ' + this.surname + ' ' + this.email;
        this._alias = ''
        if (this.name && this.surname)
            this._alias = this.name.substring(0, 1) + this.surname.substring(0, 3);

    }

    async getSystemRole() {
        if (!this.id && !this.systemEmail) throw new Error('Person should have an ID or systemEmail');
        const personIdCondition = (this.id) ? 'Persons.Id=' + this.id : '1';
        const systemEmailCondition = (this.systemEmail) ? 'Persons.SystemEmail = "' + this.systemEmail + '"' : '1';

        const sql = 'SELECT \n \t' +
            'Persons.SystemRoleId, \n \t ' +
            'Persons.Id AS PersonId, \n \t ' +
            'Persons.GoogleId AS GoogleId, \n \t ' +
            'Persons.GoogleRefreshToken AS GoogleRefreshToken, \n \t ' +
            'SystemRoles.Name AS SystemRoleName \n' +
            'FROM Persons \n ' +
            'JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id \n' +
            'WHERE ' + systemEmailCondition + ' AND ' + personIdCondition;

        try {
            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
            const row = result[0];
            return {
                id: <number>row.SystemRoleId,
                name: <string>row.SystemRoleName,
                personId: <number>row.PersonId,
                googleId: <string | undefined>row.GoogleId,
                googleRefreshToken: <string | undefined>row.GoogleRefreshToken
            };
        } catch (err) {
            throw err;
        }
    }
}