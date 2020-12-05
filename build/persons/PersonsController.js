"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsDb_1 = __importDefault(require("../tools/ToolsDb"));
var Person_1 = __importDefault(require("./Person"));
var PersonsController = /** @class */ (function () {
    function PersonsController() {
    }
    PersonsController.getPersonsList = function (initParamObject, cb) {
        var systemRolecondition = (initParamObject && initParamObject.systemRoleName) ? 'SystemRoles.Name REGEXP "' + initParamObject.systemRoleName + '"' : '1';
        var systemEmailCondition = (initParamObject && initParamObject.systemEmail) ? 'Persons.systemEmail="' + initParamObject.systemEmail + '"' : '1';
        var idCondition = (initParamObject && initParamObject.id) ? 'Persons.Id=' + initParamObject.id : '1';
        var sql = 'SELECT  Persons.Id,  \n \t' +
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
            'JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id \n' +
            'WHERE ' + systemRolecondition + ' AND ' + idCondition + ' AND ' + systemEmailCondition + '\n' +
            'ORDER BY Persons.Surname, Persons.Name';
        ToolsDb_1.default.getQueryCallback(sql, cb);
    };
    PersonsController.processPersonsResult = function (result) {
        var newResult = [];
        for (var _i = 0, result_1 = result; _i < result_1.length; _i++) {
            var row = result_1[_i];
            var item = new Person_1.default({
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
    };
    return PersonsController;
}());
exports.default = PersonsController;
