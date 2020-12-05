"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var PersonsController_1 = __importDefault(require("./PersonsController"));
var app = express_1.default();
app.get('/persons', function (req, res) {
    PersonsController_1.default.getPersonsList(req.query, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(PersonsController_1.default.processPersonsResult(result));
    });
});
app.get('/person/:id', function (req, res) {
    PersonsController_1.default.getPersonsList(req.params, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(PersonsController_1.default.processPersonsResult(result));
    });
});
module.exports = app;
