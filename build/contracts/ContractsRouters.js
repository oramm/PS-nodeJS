"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var ContractsController_1 = __importDefault(require("./ContractsController"));
var app = express_1.default();
app.get('/contracts', function (req, res) {
    ContractsController_1.default.getContractsList(req.query, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(ContractsController_1.default.processContractsResult(result));
    });
});
app.get('/contract/:id', function (req, res) {
    ContractsController_1.default.getContractsList(req.params, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(ContractsController_1.default.processContractsResult(result));
    });
});
module.exports = app;
