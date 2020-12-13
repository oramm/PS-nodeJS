import mysql from "mysql";
import Tools from "../tools/Tools";
import ToolsDb from '../tools/ToolsDb'
import Person from "./Person";

export default class PersonsController {
    static async getPersonsList(initParamObject: any) {
        const projectConditon = (initParamObject.projectId) ? 'Roles.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        var contractConditon;
        if (initParamObject.contractId)
            contractConditon =
                '(Roles.ContractId=(SELECT ProjectOurId FROM Contracts WHERE Contracts.Id=' + initParamObject.contractId + ') OR Roles.ContractId IS NULL)'
        else
            contractConditon = '1';
        const systemRolecondition = (initParamObject && initParamObject.systemRoleName) ? 'SystemRoles.Name REGEXP "' + initParamObject.systemRoleName + '"' : '1'
        const systemEmailCondition = (initParamObject && initParamObject.systemEmail) ? 'Persons.systemEmail="' + initParamObject.systemEmail + '"' : '1';
        const idCondition = (initParamObject && initParamObject.id) ? 'Persons.Id=' + initParamObject.id : '1';

        const sql = 'SELECT  Persons.Id,  \n \t' +
            'Persons.EntityId,  \n \t' +
            'Persons.Name,  \n \t' +
            'Persons.Surname,  \n \t' +
            'Persons.Position,  \n \t' +
            'Persons.Email,  \n \t' +
            'Persons.Cellphone,  \n \t' +
            'Persons.Phone,  \n \t' +
            'Persons.Comment,  \n \t' +
            'SystemRoles.Name AS SystemRoleName, \n \t' +
            'Entities.Name AS EntityName \n' +
            'FROM Persons \n' +
            'JOIN Entities ON Persons.EntityId=Entities.Id \n' +
            'JOIN Roles ON Roles.PersonId = Persons.Id \n' +
            'JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id \n' +
            'WHERE ' + projectConditon + ' AND ' + contractConditon + ' AND ' + systemRolecondition + ' AND ' + idCondition + ' AND ' + systemEmailCondition + '\n' +
            'ORDER BY Persons.Surname, Persons.Name';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processPersonsResult(result);


    }

    static processPersonsResult(result: any[]): [Person?] {
        let newResult: [Person?] = [];

        for (const row of result) {
            var item = new Person({
                id: row.Id,
                name: row.Name.trim(),
                surname: row.Surname.trim(),
                position: row.Position.trim(),
                email: row.Email.trim(),
                cellphone: row.Cellphone.trim(),
                phone: row.Phone.trim(),
                comment: row.Comment,
                systemRoleName: row.SystemRoleName.trim(),
                _entity: {
                    id: row.EntityId,
                    name: row.EntityName.trim()
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}