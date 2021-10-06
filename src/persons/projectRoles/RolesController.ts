import ToolsDb from "../../tools/ToolsDb";
import Person from "../Person";

import Role from "./Role";

export default class RolesController {
    static async getRolesList(initParamObject: any) {
        const projectCondition = (initParamObject && initParamObject.projectId) ? 'Roles.ProjectOurId="' + initParamObject.projectId + '"' : '1';

        const sql = 'SELECT \n \t' +
            'Roles.Id, \n \t' +
            'Roles.ProjectOurId, \n \t' +
            'Roles.Name, \n \t' +
            'Roles.Description, \n \t' +
            'Roles.GroupName, \n \t' +
            'Roles.ManagerId, \n \t' +
            'Persons.Id AS PersonId, \n \t' +
            'Persons.Name AS PersonName, \n \t' +
            'Persons.Surname AS PersonSurName, \n \t' +
            'Persons.Email AS PersonEmail, \n \t' +
            'Persons.Cellphone AS PersonCellphone, \n \t' +
            'Persons.Phone AS PersonPhone, \n \t' +
            'Entities.Name AS EntityName, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'SystemRoles.Name AS SystemRoleName\n' +
            'FROM Roles \n' +
            'JOIN Persons ON Persons.Id=Roles.PersonId \n' +
            'JOIN Entities ON Entities.Id=Persons.EntityId \n' +
            'JOIN SystemRoles ON SystemRoles.Id=Persons.SystemRoleId \n' +
            'LEFT JOIN Contracts ON Contracts.Id=Roles.ContractId \n' +
            'LEFT JOIN OurContractsData ON Contracts.Id=OurContractsData.ContractId \n' +
            'WHERE ' + projectCondition + ' \n' +
            'ORDER BY Roles.Name';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processRolesResult(result);


    }

    static processRolesResult(result: any[]): [Role?] {
        let newResult: [Role?] = [];

        for (const row of result) {
            var item = new Role({
                id: row.Id,
                projectOurId: row.ProjectOurId,
                name: row.Name,
                description: row.Description,
                _contract: {
                    id: row.ContractId,
                    ourId: row.ContractOurId,
                    number: row.ContractNumber,
                },
                _person: new Person({
                    id: row.PersonId,
                    name: row.PersonName.trim(),
                    surname: row.PersonSurName.trim(),
                    email: row.PersonEmail.trim(),
                    cellphone: row.PersonCellphone,
                    phone: row.PersonPhone,
                    _entity: {
                        name: (row.SystemRoleName == 'ENVI_COOPERATOR') ? 'ENVI' : row.EntityName.trim()
                    },
                }),
                _group: {
                    id: row.GroupName,
                    name: row.GroupName
                },
                managerId: row.ManagerId
            })
            newResult.push(item);
        }
        return newResult;
    }
}