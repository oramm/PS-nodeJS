"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsDb_1 = __importDefault(require("../tools/ToolsDb"));
var Entity_1 = __importDefault(require("./Entity"));
var EntitiesController = /** @class */ (function () {
    function EntitiesController() {
    }
    EntitiesController.getEntitiesList = function (initParamObject, cb) {
        var projectConditon = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        var idCondition = (initParamObject && initParamObject.id) ? 'Entities.Id=' + initParamObject.id : '1';
        var sql = 'SELECT  Entities.Id, \n \t' +
            'Entities.Name, \n \t' +
            'Entities.Address, \n \t' +
            'Entities.TaxNumber, \n \t' +
            'Entities.Www, \n \t' +
            'Entities.Email, \n \t' +
            'Entities.Phone, \n \t' +
            'Entities.Fax \n' +
            'FROM Entities \n' +
            'WHERE ' + projectConditon + ' AND ' + idCondition + '\n' +
            'ORDER BY Entities.Name';
        ToolsDb_1.default.getQueryCallback(sql, cb);
    };
    EntitiesController.processEntitiesResult = function (result) {
        var newResult = [];
        for (var _i = 0, result_1 = result; _i < result_1.length; _i++) {
            var row = result_1[_i];
            var item = new Entity_1.default({
                id: row.Id,
                name: row.Name,
                address: row.Address,
                taxNumber: row.TaxNumber,
                www: row.Www,
                email: row.Email,
                phone: row.Phone,
                fax: row.Fax
            });
            newResult.push(item);
        }
        return newResult;
    };
    return EntitiesController;
}());
exports.default = EntitiesController;
